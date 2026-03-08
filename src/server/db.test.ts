import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LogDatabase, parseSearchQuery, normalizeIntervalMs } from "./db";
import type { NormalizedLog } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLog(overrides: Partial<NormalizedLog> & { _id: bigint }): NormalizedLog {
  return {
    _ingested: new Date("2026-01-15T10:00:00Z"),
    _raw: JSON.stringify({ message: "test" }),
    timestamp: new Date("2026-01-15T10:00:00Z"),
    level: "INFO",
    message: "test message",
    service: "api",
    trace_id: null,
    host: "localhost",
    duration_ms: null,
    source: "default",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 2.1 Database initialization and table creation
// ---------------------------------------------------------------------------

describe("LogDatabase - initialization", () => {
  let db: LogDatabase;

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it("initializes in-memory database by default", async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    // Should not throw; DB is ready
  });

  it("creates logs table with expected columns", async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    const schema = await db.getSchema();
    const columnNames = schema.map((c) => c.name);
    expect(columnNames).toEqual([
      "_id",
      "_ingested",
      "_raw",
      "timestamp",
      "level",
      "message",
      "service",
      "trace_id",
      "host",
      "duration_ms",
      "source",
    ]);
  });

  it("schema returns correct types", async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    const schema = await db.getSchema();

    const idCol = schema.find((c) => c.name === "_id");
    expect(idCol?.type).toBe("BIGINT");
    expect(idCol?.nullable).toBe(false); // PRIMARY KEY

    const levelCol = schema.find((c) => c.name === "level");
    expect(levelCol?.type).toBe("VARCHAR");
    expect(levelCol?.nullable).toBe(true);

    const durationCol = schema.find((c) => c.name === "duration_ms");
    expect(durationCol?.type).toBe("DOUBLE");

    const rawCol = schema.find((c) => c.name === "_raw");
    expect(rawCol?.type).toBe("JSON");
  });

  it("close shuts down the database", async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    await db.close();
    // After close, further operations should fail
    await expect(db.getSchema()).rejects.toThrow();
    // Prevent afterEach from double-closing
    db = undefined as unknown as LogDatabase;
  });

  it("creates indexes on level, timestamp, service, and source columns", async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    // Query DuckDB metadata to verify indexes exist
    const result = await db.executeQuery(
      "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'logs' ORDER BY index_name"
    );
    const indexNames = result.rows.map((row) => row[0]);
    expect(indexNames).toContain("idx_level");
    expect(indexNames).toContain("idx_ts");
    expect(indexNames).toContain("idx_service");
    expect(indexNames).toContain("idx_source");
  });

  it("initializes with file persistence mode", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slogtail-test-"));
    const dbPath = path.join(tmpDir, "test.duckdb");

    try {
      db = new LogDatabase();
      await db.initialize(dbPath);

      // Insert data
      const log = makeLog({ _id: 1n, message: "persisted" });
      await db.insertBatch([log]);

      // Verify data was written
      const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
      expect(result.total).toBe(1);
      expect(result.logs[0].message).toBe("persisted");

      await db.close();

      // Reopen and verify data persists
      db = new LogDatabase();
      await db.initialize(dbPath);
      const result2 = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
      expect(result2.total).toBe(1);
      expect(result2.logs[0].message).toBe("persisted");
    } finally {
      // Cleanup
      try {
        if (db) await db.close();
      } catch { /* ignore */ }
      fs.rmSync(tmpDir, { recursive: true, force: true });
      db = undefined as unknown as LogDatabase;
    }
  });
});

// ---------------------------------------------------------------------------
// 2.2 Batch INSERT and eviction
// ---------------------------------------------------------------------------

describe("LogDatabase - insertBatch", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it("inserts a single log row", async () => {
    const log = makeLog({ _id: 1n });
    await db.insertBatch([log]);

    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]._id).toBe(1n);
    expect(result.logs[0].level).toBe("INFO");
    expect(result.logs[0].message).toBe("test message");
    expect(result.logs[0].service).toBe("api");
    expect(result.logs[0].source).toBe("default");
  });

  it("inserts multiple log rows in a batch", async () => {
    const logs = [
      makeLog({ _id: 1n, level: "INFO", message: "msg1" }),
      makeLog({ _id: 2n, level: "ERROR", message: "msg2" }),
      makeLog({ _id: 3n, level: "DEBUG", message: "msg3" }),
    ];
    await db.insertBatch(logs);

    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(3);
    expect(result.logs).toHaveLength(3);
  });

  it("handles null fields correctly", async () => {
    const log = makeLog({
      _id: 1n,
      timestamp: null,
      level: null,
      message: null,
      service: null,
      trace_id: null,
      host: null,
      duration_ms: null,
    });
    await db.insertBatch([log]);

    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.logs[0].timestamp).toBeNull();
    expect(result.logs[0].level).toBeNull();
    expect(result.logs[0].message).toBeNull();
    expect(result.logs[0].service).toBeNull();
    expect(result.logs[0].host).toBeNull();
    expect(result.logs[0].duration_ms).toBeNull();
  });

  it("preserves _raw JSON data", async () => {
    const rawJson = { level: "INFO", msg: "hello", extra: { nested: true } };
    const log = makeLog({ _id: 1n, _raw: JSON.stringify(rawJson) });
    await db.insertBatch([log]);

    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.logs[0]._raw).toEqual(rawJson);
  });

  it("preserves plain text _raw data through insert and query", async () => {
    const log = makeLog({
      _id: 1n,
      _raw: JSON.stringify({ message: "plain text line" }),
      message: "plain text line",
      level: null,
    });
    await db.insertBatch([log]);

    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.logs[0]._raw).toEqual({ message: "plain text line" });
    expect(result.logs[0].message).toBe("plain text line");
    expect(result.logs[0].level).toBeNull();
  });
});

describe("LogDatabase - evictOldRows", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it("evicts old rows when exceeding maxRows", async () => {
    const logs = Array.from({ length: 10 }, (_, i) =>
      makeLog({ _id: BigInt(i + 1) })
    );
    await db.insertBatch(logs);

    await db.evictOldRows(5);

    const result = await db.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBe(5);
    // Only the latest 5 rows should remain (IDs 6-10)
    const ids = result.logs.map((l) => l._id);
    expect(ids).toEqual([6n, 7n, 8n, 9n, 10n]);
  });

  it("does nothing when row count is within maxRows", async () => {
    const logs = Array.from({ length: 3 }, (_, i) =>
      makeLog({ _id: BigInt(i + 1) })
    );
    await db.insertBatch(logs);

    await db.evictOldRows(10);

    const result = await db.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBe(3);
  });

  it("evicts to exact maxRows count", async () => {
    const logs = Array.from({ length: 20 }, (_, i) =>
      makeLog({ _id: BigInt(i + 1) })
    );
    await db.insertBatch(logs);

    await db.evictOldRows(1);

    const result = await db.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(20n);
  });
});

// ---------------------------------------------------------------------------
// 2.3 Query, aggregation, facets, and custom SQL
// ---------------------------------------------------------------------------

describe("LogDatabase - queryLogs filters", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    const logs = [
      makeLog({ _id: 1n, level: "INFO", service: "api", message: "request started", source: "proc-1", timestamp: new Date("2026-01-15T10:00:00Z") }),
      makeLog({ _id: 2n, level: "ERROR", service: "api", message: "connection failed", source: "proc-1", timestamp: new Date("2026-01-15T10:01:00Z") }),
      makeLog({ _id: 3n, level: "WARN", service: "worker", message: "slow query detected", source: "proc-2", timestamp: new Date("2026-01-15T10:02:00Z") }),
      makeLog({ _id: 4n, level: "INFO", service: "worker", message: "task completed", source: "proc-2", timestamp: new Date("2026-01-15T10:03:00Z") }),
      makeLog({ _id: 5n, level: "ERROR", service: "api", message: "timeout error", source: "proc-1", timestamp: new Date("2026-01-15T10:04:00Z") }),
    ];
    await db.insertBatch(logs);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("filters by level", async () => {
    const result = await db.queryLogs({ level: ["ERROR"], limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(2);
    expect(result.logs.every((l) => l.level === "ERROR")).toBe(true);
  });

  it("filters by multiple levels (OR)", async () => {
    const result = await db.queryLogs({ level: ["ERROR", "WARN"], limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(3);
    expect(result.logs.every((l) => l.level === "ERROR" || l.level === "WARN")).toBe(true);
  });

  it("filters by service", async () => {
    const result = await db.queryLogs({ service: ["worker"], limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(2);
    expect(result.logs.every((l) => l.service === "worker")).toBe(true);
  });

  it("filters by source", async () => {
    const result = await db.queryLogs({ source: ["proc-1"], limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(3);
    expect(result.logs.every((l) => l.source === "proc-1")).toBe(true);
  });

  it("filters by search (case-insensitive substring)", async () => {
    const result = await db.queryLogs({ search: "error", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0].message).toBe("timeout error");
  });

  it("filters by time range", async () => {
    const result = await db.queryLogs({
      startTime: new Date("2026-01-15T10:01:00Z"),
      endTime: new Date("2026-01-15T10:03:00Z"),
      limit: 10,
      offset: 0,
      order: "asc",
    });
    expect(result.total).toBe(3);
  });

  it("combines multiple filters with AND", async () => {
    const result = await db.queryLogs({
      level: ["ERROR"],
      service: ["api"],
      limit: 10,
      offset: 0,
      order: "asc",
    });
    expect(result.total).toBe(2);
  });

  it("respects limit and offset", async () => {
    const result = await db.queryLogs({ limit: 2, offset: 1, order: "asc" });
    expect(result.total).toBe(5); // Total is all matching
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0]._id).toBe(2n); // Second row (offset=1)
  });

  it("orders by timestamp DESC", async () => {
    const result = await db.queryLogs({ limit: 10, offset: 0, order: "desc" });
    expect(result.logs[0]._id).toBe(5n); // Latest timestamp first
    expect(result.logs[4]._id).toBe(1n);
  });

  it("orders by timestamp ASC", async () => {
    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.logs[0]._id).toBe(1n); // Earliest timestamp first
    expect(result.logs[4]._id).toBe(5n);
  });
});

describe("LogDatabase - getStats", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("returns correct stats for populated database", async () => {
    const logs = [
      makeLog({ _id: 1n, level: "INFO", timestamp: new Date("2026-01-15T10:00:00Z") }),
      makeLog({ _id: 2n, level: "ERROR", timestamp: new Date("2026-01-15T10:01:00Z") }),
      makeLog({ _id: 3n, level: "WARN", timestamp: new Date("2026-01-15T10:02:00Z") }),
      makeLog({ _id: 4n, level: "ERROR", timestamp: new Date("2026-01-15T10:03:00Z") }),
      makeLog({ _id: 5n, level: "FATAL", timestamp: new Date("2026-01-15T10:04:00Z") }),
    ];
    await db.insertBatch(logs);

    const stats = await db.getStats();
    expect(stats.total).toBe(5);
    expect(stats.byLevel).toEqual({
      INFO: 1,
      ERROR: 2,
      WARN: 1,
      FATAL: 1,
    });
    // errorRate = (ERROR + FATAL) / total
    expect(stats.errorRate).toBeCloseTo(0.6);
    expect(stats.timeRange.min).toEqual(new Date("2026-01-15T10:00:00Z"));
    expect(stats.timeRange.max).toEqual(new Date("2026-01-15T10:04:00Z"));
  });

  it("returns empty stats for empty database", async () => {
    const stats = await db.getStats();
    expect(stats.total).toBe(0);
    expect(stats.byLevel).toEqual({});
    expect(stats.errorRate).toBe(0);
    expect(stats.timeRange.min).toBeNull();
    expect(stats.timeRange.max).toBeNull();
  });

  it("filters stats by source", async () => {
    const logs = [
      makeLog({ _id: 1n, level: "INFO", source: "proc-1" }),
      makeLog({ _id: 2n, level: "ERROR", source: "proc-1" }),
      makeLog({ _id: 3n, level: "WARN", source: "proc-2" }),
    ];
    await db.insertBatch(logs);

    const stats = await db.getStats({ source: "proc-1" });
    expect(stats.total).toBe(2);
    expect(stats.byLevel).toEqual({ INFO: 1, ERROR: 1 });
  });
});

describe("LogDatabase - getFacetDistribution", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    const logs = [
      makeLog({ _id: 1n, level: "INFO", service: "api", _raw: JSON.stringify({ level: "INFO", metadata: { region: "us-east" } }) }),
      makeLog({ _id: 2n, level: "ERROR", service: "api", _raw: JSON.stringify({ level: "ERROR", metadata: { region: "us-east" } }) }),
      makeLog({ _id: 3n, level: "INFO", service: "worker", _raw: JSON.stringify({ level: "INFO", metadata: { region: "eu-west" } }) }),
      makeLog({ _id: 4n, level: "WARN", service: "worker", _raw: JSON.stringify({ level: "WARN", metadata: { region: "us-east" } }) }),
    ];
    await db.insertBatch(logs);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("returns facet distribution for a standard column", async () => {
    const dist = await db.getFacetDistribution("level", null, {});
    expect(dist.field).toBe("level");
    expect(dist.values).toHaveLength(3);

    // Should be sorted by count DESC
    const infoCount = dist.values.find((v) => v.value === "INFO");
    expect(infoCount?.count).toBe(2);

    const errorCount = dist.values.find((v) => v.value === "ERROR");
    expect(errorCount?.count).toBe(1);
  });

  it("returns facet distribution for a nested JSON path", async () => {
    const dist = await db.getFacetDistribution("metadata.region", "metadata.region", {});
    expect(dist.field).toBe("metadata.region");

    const usEast = dist.values.find((v) => v.value === "us-east");
    expect(usEast?.count).toBe(3);

    const euWest = dist.values.find((v) => v.value === "eu-west");
    expect(euWest?.count).toBe(1);
  });

  it("applies filters to facet distribution", async () => {
    const dist = await db.getFacetDistribution("level", null, { service: ["api"] });
    expect(dist.values).toHaveLength(2);
    // Only logs with service=api: INFO(1), ERROR(1)
    expect(dist.values.find((v) => v.value === "INFO")?.count).toBe(1);
    expect(dist.values.find((v) => v.value === "ERROR")?.count).toBe(1);
  });

  it("applies source filter to facet distribution", async () => {
    // First, re-insert with distinct sources
    const sourceDb = new LogDatabase();
    await sourceDb.initialize(":memory:");
    const logs = [
      makeLog({ _id: 1n, level: "INFO", source: "proc-a" }),
      makeLog({ _id: 2n, level: "ERROR", source: "proc-a" }),
      makeLog({ _id: 3n, level: "INFO", source: "proc-b" }),
    ];
    await sourceDb.insertBatch(logs);

    const dist = await sourceDb.getFacetDistribution("level", null, { source: ["proc-a"] });
    expect(dist.values).toHaveLength(2);
    expect(dist.values.find((v) => v.value === "INFO")?.count).toBe(1);
    expect(dist.values.find((v) => v.value === "ERROR")?.count).toBe(1);

    await sourceDb.close();
  });

  it("returns empty values array for facet with no matching data", async () => {
    const dist = await db.getFacetDistribution("level", null, { service: ["nonexistent"] });
    expect(dist.field).toBe("level");
    expect(dist.values).toHaveLength(0);
  });
});

describe("LogDatabase - getHistogram", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    await db.insertBatch([
      makeLog({
        _id: 1n,
        level: "info",
        service: "api",
        timestamp: new Date("2026-01-15T10:00:10Z"),
      }),
      makeLog({
        _id: 2n,
        level: "ERROR",
        service: "api",
        timestamp: new Date("2026-01-15T10:00:40Z"),
      }),
      makeLog({
        _id: 3n,
        level: "warn",
        service: "worker",
        timestamp: new Date("2026-01-15T10:01:05Z"),
      }),
    ]);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("returns bucketed histogram rows with normalized levels", async () => {
    const histogram = await db.getHistogram({
      buckets: 3,
      startTime: new Date("2026-01-15T10:00:00Z"),
      endTime: new Date("2026-01-15T10:03:00Z"),
    });

    expect(histogram.interval).toBe("1 minute");
    expect(histogram.buckets).toHaveLength(3);

    const first = histogram.buckets.find(
      (bucket) => bucket.timestamp === "2026-01-15T10:00:00.000Z",
    );
    expect(first?.counts.INFO).toBe(1);
    expect(first?.counts.ERROR).toBe(1);
  });

  it("applies filters to histogram query", async () => {
    const histogram = await db.getHistogram({
      buckets: 3,
      service: ["worker"],
      startTime: new Date("2026-01-15T10:00:00Z"),
      endTime: new Date("2026-01-15T10:03:00Z"),
    });

    const second = histogram.buckets.find(
      (bucket) => bucket.timestamp === "2026-01-15T10:01:00.000Z",
    );
    expect(second?.counts.WARN).toBe(1);

    const first = histogram.buckets.find(
      (bucket) => bucket.timestamp === "2026-01-15T10:00:00.000Z",
    );
    expect(first?.counts.INFO ?? 0).toBe(0);
  });
});

describe("LogDatabase - getHistogram 15m/120 bucket gap fix", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("does not produce gaps when 15m range is split into 120 buckets", async () => {
    // 15 minutes / 120 buckets = 7500ms raw interval
    // Without normalization: intervalMsToIntervalString(7500) → "7 seconds"
    // JS would step by 7500ms but DuckDB groups by 7000ms → keys mismatch → gaps
    const startTime = new Date("2026-01-15T10:00:00Z");
    const endTime = new Date("2026-01-15T10:15:00Z");

    // Insert logs spread across the 15-minute window
    const logs = [];
    for (let i = 0; i < 30; i++) {
      const ts = new Date(startTime.getTime() + i * 30_000); // every 30 seconds
      logs.push(
        makeLog({
          _id: BigInt(i + 1),
          level: "INFO",
          timestamp: ts,
        }),
      );
    }
    await db.insertBatch(logs);

    const histogram = await db.getHistogram({
      buckets: 120,
      startTime,
      endTime,
    });

    // Every bucket with data should have a non-empty counts object.
    // The total count across all buckets should equal the number of inserted logs.
    let totalCount = 0;
    for (const bucket of histogram.buckets) {
      for (const count of Object.values(bucket.counts)) {
        totalCount += count;
      }
    }
    expect(totalCount).toBe(30);

    // Verify no duplicate timestamps (which would indicate alignment issues)
    const timestamps = histogram.buckets.map((b) => b.timestamp);
    const uniqueTimestamps = new Set(timestamps);
    expect(uniqueTimestamps.size).toBe(timestamps.length);
  });
});

describe("normalizeIntervalMs", () => {
  it("normalizes 7500ms to 7000ms (7 seconds)", () => {
    expect(normalizeIntervalMs(7500)).toBe(7000);
  });

  it("preserves exact second boundaries", () => {
    expect(normalizeIntervalMs(5000)).toBe(5000);
  });

  it("preserves exact minute boundaries", () => {
    expect(normalizeIntervalMs(60000)).toBe(60000);
    expect(normalizeIntervalMs(120000)).toBe(120000);
  });

  it("preserves 90000ms (exactly 90 seconds)", () => {
    // 90000 % 60000 != 0, falls to seconds: floor(90000/1000) = 90 -> "90 seconds" -> 90000
    expect(normalizeIntervalMs(90000)).toBe(90000);
  });

  it("normalizes 61500ms to 61000ms (61 seconds)", () => {
    // 61500 % 60000 != 0, falls to seconds: floor(61500/1000) = 61 -> "61 seconds" -> 61000
    expect(normalizeIntervalMs(61500)).toBe(61000);
  });

  it("preserves exact hour boundaries", () => {
    expect(normalizeIntervalMs(3600000)).toBe(3600000);
  });

  it("normalizes 3900000ms (65 minutes) to 3900000ms (exact minutes)", () => {
    // 3900000 % 3600000 != 0, 3900000 % 60000 = 0 -> "65 minutes" -> 3900000
    expect(normalizeIntervalMs(3900000)).toBe(3900000);
  });

  it("preserves exact day boundaries", () => {
    expect(normalizeIntervalMs(86400000)).toBe(86400000);
  });
});

describe("LogDatabase - executeQuery", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    const logs = [
      makeLog({ _id: 1n, level: "INFO" }),
      makeLog({ _id: 2n, level: "ERROR" }),
    ];
    await db.insertBatch(logs);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("executes a SELECT query", async () => {
    const result = await db.executeQuery("SELECT _id, level FROM logs ORDER BY _id");
    expect(result.columns).toEqual(["_id", "level"]);
    expect(result.rows).toHaveLength(2);
  });

  it("executes a WITH query", async () => {
    const result = await db.executeQuery(
      "WITH cte AS (SELECT level, COUNT(*) as cnt FROM logs GROUP BY level) SELECT * FROM cte ORDER BY cnt DESC"
    );
    expect(result.columns).toEqual(["level", "cnt"]);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("executes an EXPLAIN query", async () => {
    const result = await db.executeQuery("EXPLAIN SELECT * FROM logs");
    expect(result.columns.length).toBeGreaterThan(0);
  });

  it("rejects DELETE statements", async () => {
    await expect(db.executeQuery("DELETE FROM logs")).rejects.toThrow();
  });

  it("rejects INSERT statements", async () => {
    await expect(
      db.executeQuery("INSERT INTO logs (_id) VALUES (99)")
    ).rejects.toThrow();
  });

  it("rejects DROP statements", async () => {
    await expect(db.executeQuery("DROP TABLE logs")).rejects.toThrow();
  });

  it("rejects UPDATE statements", async () => {
    await expect(
      db.executeQuery("UPDATE logs SET level = 'FATAL'")
    ).rejects.toThrow();
  });

  it("allows case-insensitive SELECT", async () => {
    const result = await db.executeQuery("select _id from logs");
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("allows SELECT with leading whitespace", async () => {
    const result = await db.executeQuery("  SELECT _id FROM logs");
    expect(result.rows.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2.4 Export functionality
// ---------------------------------------------------------------------------

describe("LogDatabase - exportLogs", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    const logs = [
      makeLog({
        _id: 1n,
        level: "INFO",
        service: "api",
        message: "request started",
        timestamp: new Date("2026-01-15T10:00:00Z"),
        _raw: JSON.stringify({ level: "INFO", message: "request started" }),
      }),
      makeLog({
        _id: 2n,
        level: "ERROR",
        service: "api",
        message: "connection failed",
        timestamp: new Date("2026-01-15T10:01:00Z"),
        _raw: JSON.stringify({ level: "ERROR", message: "connection failed" }),
      }),
      makeLog({
        _id: 3n,
        level: "WARN",
        service: "worker",
        message: "slow query",
        timestamp: new Date("2026-01-15T10:02:00Z"),
        _raw: JSON.stringify({ level: "WARN", message: "slow query" }),
      }),
    ];
    await db.insertBatch(logs);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("exports all logs as CSV", async () => {
    const stream = await db.exportLogs(
      { limit: 100, offset: 0, order: "asc" },
      "csv"
    );
    const text = await streamToString(stream);
    // CSV should have a header line and data lines
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(4); // 1 header + 3 data rows
    // Header should contain column names
    expect(lines[0]).toContain("_id");
    expect(lines[0]).toContain("level");
    expect(lines[0]).toContain("message");
  });

  it("exports filtered logs as CSV", async () => {
    const stream = await db.exportLogs(
      { level: ["ERROR"], limit: 100, offset: 0, order: "asc" },
      "csv"
    );
    const text = await streamToString(stream);
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2); // 1 header + 1 data row
  });

  it("exports all logs as JSON", async () => {
    const stream = await db.exportLogs(
      { limit: 100, offset: 0, order: "asc" },
      "json"
    );
    const text = await streamToString(stream);
    const data = JSON.parse(text);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3);
    expect(data[0]).toHaveProperty("_id");
    expect(data[0]).toHaveProperty("level");
    expect(data[0]).toHaveProperty("message");
  });

  it("exports filtered logs as JSON", async () => {
    const stream = await db.exportLogs(
      { service: ["worker"], limit: 100, offset: 0, order: "asc" },
      "json"
    );
    const text = await streamToString(stream);
    const data = JSON.parse(text);
    expect(data).toHaveLength(1);
    expect(data[0].service).toBe("worker");
  });
});

// ---------------------------------------------------------------------------
// parseSearchQuery unit tests
// ---------------------------------------------------------------------------

describe("parseSearchQuery", () => {
  it("returns plain text search for a simple keyword", () => {
    const result = parseSearchQuery("error");
    expect(result).toEqual({ field: null, value: "error" });
  });

  it("returns plain text search for an empty string", () => {
    const result = parseSearchQuery("");
    expect(result).toEqual({ field: null, value: "" });
  });

  it("parses field:value syntax correctly", () => {
    const result = parseSearchQuery("host:server-1");
    expect(result).toEqual({ field: "host", value: "server-1" });
  });

  it("parses service:value syntax correctly", () => {
    const result = parseSearchQuery("service:api");
    expect(result).toEqual({ field: "service", value: "api" });
  });

  it("parses message:value syntax correctly", () => {
    const result = parseSearchQuery("message:timeout");
    expect(result).toEqual({ field: "message", value: "timeout" });
  });

  it("parses trace_id:value syntax correctly", () => {
    const result = parseSearchQuery("trace_id:abc-123");
    expect(result).toEqual({ field: "trace_id", value: "abc-123" });
  });

  it("parses level:value syntax correctly", () => {
    const result = parseSearchQuery("level:ERROR");
    expect(result).toEqual({ field: "level", value: "ERROR" });
  });

  it("falls back to plain text for unknown field names", () => {
    const result = parseSearchQuery("unknownfield:value");
    expect(result).toEqual({ field: null, value: "unknownfield:value" });
  });

  it("falls back to plain text when field name is empty (e.g., ':value')", () => {
    const result = parseSearchQuery(":value");
    expect(result).toEqual({ field: null, value: ":value" });
  });

  it("falls back to plain text when value is empty (e.g., 'host:')", () => {
    const result = parseSearchQuery("host:");
    expect(result).toEqual({ field: null, value: "host:" });
  });

  it("handles value containing colons (e.g., 'host:server:8080')", () => {
    const result = parseSearchQuery("host:server:8080");
    expect(result).toEqual({ field: "host", value: "server:8080" });
  });

  it("falls back to plain text for text with spaces even if containing colon", () => {
    const result = parseSearchQuery("some error: timeout");
    expect(result).toEqual({ field: null, value: "some error: timeout" });
  });
});

// ---------------------------------------------------------------------------
// Cross-field search (横断検索) integration tests
// ---------------------------------------------------------------------------

describe("LogDatabase - cross-field search", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    const logs = [
      makeLog({
        _id: 1n,
        message: "request started",
        service: "api-gateway",
        host: "prod-server-1",
        trace_id: "trace-abc-123",
        _raw: JSON.stringify({ message: "request started", service: "api-gateway", host: "prod-server-1", trace_id: "trace-abc-123" }),
      }),
      makeLog({
        _id: 2n,
        message: "connection failed",
        service: "database",
        host: "db-server-2",
        trace_id: "trace-def-456",
        _raw: JSON.stringify({ message: "connection failed", service: "database", host: "db-server-2", trace_id: "trace-def-456", extra: "unique-payload" }),
      }),
      makeLog({
        _id: 3n,
        message: "task completed",
        service: "worker",
        host: "worker-node-3",
        trace_id: null,
        _raw: JSON.stringify({ message: "task completed", service: "worker", host: "worker-node-3" }),
      }),
    ];
    await db.insertBatch(logs);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("searches across message field", async () => {
    const result = await db.queryLogs({ search: "connection", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(2n);
  });

  it("searches across service field", async () => {
    const result = await db.queryLogs({ search: "gateway", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(1n);
  });

  it("searches across host field", async () => {
    const result = await db.queryLogs({ search: "db-server", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(2n);
  });

  it("searches across trace_id field", async () => {
    const result = await db.queryLogs({ search: "trace-abc", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(1n);
  });

  it("searches across _raw JSON field", async () => {
    const result = await db.queryLogs({ search: "unique-payload", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(2n);
  });

  it("returns multiple results when keyword matches across different fields", async () => {
    // "server" appears in host of logs 1 and 2
    const result = await db.queryLogs({ search: "server", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(2);
  });

  it("uses field:value syntax to search only in a specific field", async () => {
    const result = await db.queryLogs({ search: "service:worker", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(3n);
  });

  it("uses field:value syntax for host field", async () => {
    const result = await db.queryLogs({ search: "host:prod-server-1", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(1n);
  });

  it("uses field:value with partial match (ILIKE)", async () => {
    const result = await db.queryLogs({ search: "host:prod", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(1);
    expect(result.logs[0]._id).toBe(1n);
  });

  it("falls back to cross-field search for invalid field:value syntax", async () => {
    // "unknownfield:value" is not a valid field, so should search across all fields
    const result = await db.queryLogs({ search: "unknownfield:value", limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(0);
  });

  it("falls back to cross-field search when value is empty in field:value", async () => {
    // "host:" has empty value, should be treated as plain text search across all fields.
    // DuckDB formats JSON with spaces (e.g., "host": "value"), so "host:" without space
    // won't match the _raw JSON representation. This test verifies the fallback behavior:
    // it treats "host:" as plain text and searches across all fields.
    const result = await db.queryLogs({ search: "host:", limit: 10, offset: 0, order: "asc" });
    // No field contains the literal "host:" substring, so 0 results is expected
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case-insensitive level filtering (Task 1.2)
// ---------------------------------------------------------------------------

describe("LogDatabase - case-insensitive level filtering", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    // Insert logs with mixed-case level values
    const logs = [
      makeLog({ _id: 1n, level: "INFO", message: "uppercase info" }),
      makeLog({ _id: 2n, level: "info", message: "lowercase info" }),
      makeLog({ _id: 3n, level: "Info", message: "mixed case info" }),
      makeLog({ _id: 4n, level: "ERROR", message: "uppercase error" }),
      makeLog({ _id: 5n, level: "error", message: "lowercase error" }),
      makeLog({ _id: 6n, level: "WARN", message: "uppercase warn" }),
      makeLog({ _id: 7n, level: "warn", message: "lowercase warn" }),
    ];
    await db.insertBatch(logs);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("filters by level case-insensitively when querying with uppercase", async () => {
    const result = await db.queryLogs({ level: ["INFO"], limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(3);
    // All three INFO/info/Info logs should be matched
    const messages = result.logs.map((l) => l.message);
    expect(messages).toContain("uppercase info");
    expect(messages).toContain("lowercase info");
    expect(messages).toContain("mixed case info");
  });

  it("filters by level case-insensitively when querying with lowercase", async () => {
    const result = await db.queryLogs({ level: ["error" as never], limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(2);
    const messages = result.logs.map((l) => l.message);
    expect(messages).toContain("uppercase error");
    expect(messages).toContain("lowercase error");
  });

  it("filters by multiple levels case-insensitively", async () => {
    const result = await db.queryLogs({ level: ["INFO", "error" as never], limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(5);
  });

  it("preserves the original level value in query results", async () => {
    const result = await db.queryLogs({ level: ["INFO"], limit: 10, offset: 0, order: "asc" });
    const levels = result.logs.map((l) => l.level);
    // Original casing should be preserved
    expect(levels).toContain("INFO");
    expect(levels).toContain("info");
    expect(levels).toContain("Info");
  });
});

describe("LogDatabase - case-insensitive level facet aggregation", () => {
  let db: LogDatabase;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");

    // Insert logs with mixed-case level values
    const logs = [
      makeLog({ _id: 1n, level: "INFO" }),
      makeLog({ _id: 2n, level: "info" }),
      makeLog({ _id: 3n, level: "Info" }),
      makeLog({ _id: 4n, level: "ERROR" }),
      makeLog({ _id: 5n, level: "error" }),
      makeLog({ _id: 6n, level: "WARN" }),
    ];
    await db.insertBatch(logs);
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it("groups level facets by uppercase-normalized value", async () => {
    const dist = await db.getFacetDistribution("level", null, {});
    expect(dist.field).toBe("level");

    // Should have 3 groups: INFO(3), ERROR(2), WARN(1)
    expect(dist.values).toHaveLength(3);

    const infoFacet = dist.values.find((v) => v.value === "INFO");
    expect(infoFacet?.count).toBe(3);

    const errorFacet = dist.values.find((v) => v.value === "ERROR");
    expect(errorFacet?.count).toBe(2);

    const warnFacet = dist.values.find((v) => v.value === "WARN");
    expect(warnFacet?.count).toBe(1);
  });

  it("does not create separate facets for different casings of the same level", async () => {
    const dist = await db.getFacetDistribution("level", null, {});
    // There should be no "info" or "Info" facet values - only "INFO"
    const facetValues = dist.values.map((v) => v.value);
    expect(facetValues).not.toContain("info");
    expect(facetValues).not.toContain("Info");
    expect(facetValues).not.toContain("error");
  });

  it("applies filters correctly when computing level facets", async () => {
    // Add host data to distinguish
    const dbWithHosts = new LogDatabase();
    await dbWithHosts.initialize(":memory:");
    const logs = [
      makeLog({ _id: 1n, level: "INFO", host: "host-a" }),
      makeLog({ _id: 2n, level: "info", host: "host-a" }),
      makeLog({ _id: 3n, level: "ERROR", host: "host-b" }),
      makeLog({ _id: 4n, level: "error", host: "host-a" }),
    ];
    await dbWithHosts.insertBatch(logs);

    const dist = await dbWithHosts.getFacetDistribution("level", null, { host: ["host-a"] });
    // host-a has: INFO(1) + info(1) = INFO(2), error(1) = ERROR(1)
    expect(dist.values).toHaveLength(2);
    expect(dist.values.find((v) => v.value === "INFO")?.count).toBe(2);
    expect(dist.values.find((v) => v.value === "ERROR")?.count).toBe(1);

    await dbWithHosts.close();
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}
