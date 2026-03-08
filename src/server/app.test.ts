import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApiApp } from "./app";
import { LogDatabase } from "./db";
import { Ingester } from "./ingester";
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
// Shared setup
// ---------------------------------------------------------------------------

let db: LogDatabase;
let app: ReturnType<typeof createApiApp>;

beforeAll(async () => {
  db = new LogDatabase();
  await db.initialize(":memory:");
  app = createApiApp(db);
});

afterAll(async () => {
  if (db) await db.close();
});

// ---------------------------------------------------------------------------
// 4.1 - GET /api/health
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  it("returns status ok and uptime", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 4.1 - GET /api/schema
// ---------------------------------------------------------------------------

describe("GET /api/schema", () => {
  it("returns logs table column definitions", async () => {
    const res = await app.request("/api/schema");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const names = body.map((c: { name: string }) => c.name);
    expect(names).toContain("_id");
    expect(names).toContain("level");
    expect(names).toContain("message");
    expect(names).toContain("source");
  });

  it("returns correct column structure", async () => {
    const res = await app.request("/api/schema");
    const body = await res.json();
    const col = body.find((c: { name: string }) => c.name === "_id");
    expect(col).toHaveProperty("name");
    expect(col).toHaveProperty("type");
    expect(col).toHaveProperty("nullable");
  });
});

// ---------------------------------------------------------------------------
// 4.1 - GET /api/stats
// ---------------------------------------------------------------------------

describe("GET /api/stats", () => {
  let statsDb: LogDatabase;
  let statsApp: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    statsDb = new LogDatabase();
    await statsDb.initialize(":memory:");
    statsApp = createApiApp(statsDb);

    const logs = [
      makeLog({ _id: 1n, level: "INFO", source: "proc-1", timestamp: new Date("2026-01-15T10:00:00Z") }),
      makeLog({ _id: 2n, level: "ERROR", source: "proc-1", timestamp: new Date("2026-01-15T10:01:00Z") }),
      makeLog({ _id: 3n, level: "WARN", source: "proc-2", timestamp: new Date("2026-01-15T10:02:00Z") }),
      makeLog({ _id: 4n, level: "ERROR", source: "proc-2", timestamp: new Date("2026-01-15T10:03:00Z") }),
      makeLog({ _id: 5n, level: "FATAL", source: "proc-1", timestamp: new Date("2026-01-15T10:04:00Z") }),
    ];
    await statsDb.insertBatch(logs);
  });

  afterAll(async () => {
    if (statsDb) await statsDb.close();
  });

  it("returns stats with level counts and error rate", async () => {
    const res = await statsApp.request("/api/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(5);
    expect(body.byLevel).toBeDefined();
    expect(typeof body.errorRate).toBe("number");
    expect(body.timeRange).toBeDefined();
  });

  it("filters stats by source parameter", async () => {
    const res = await statsApp.request("/api/stats?source=proc-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
  });

  it("returns empty stats for empty database", async () => {
    const emptyDb = new LogDatabase();
    await emptyDb.initialize(":memory:");
    const emptyApp = createApiApp(emptyDb);

    const res = await emptyApp.request("/api/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.errorRate).toBe(0);

    await emptyDb.close();
  });

  it("includes ingestionRate field when ingester is provided", async () => {
    const rateDb = new LogDatabase();
    await rateDb.initialize(":memory:");
    const ingester = new Ingester(rateDb, {
      batchSize: 5000,
      flushIntervalMs: 500,
      maxRows: 100_000,
      defaultSource: "default",
    });
    ingester.startTimer();
    const rateApp = createApiApp(rateDb, ingester);

    const res = await rateApp.request("/api/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.ingestionRate).toBe("number");
    expect(body.ingestionRate).toBeGreaterThanOrEqual(0);

    await ingester.stop();
    await rateDb.close();
  });

  it("returns ingestionRate of 0 when no ingester is provided", async () => {
    const res = await statsApp.request("/api/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.ingestionRate).toBe("number");
    expect(body.ingestionRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4.1 - GET /api/logs
// ---------------------------------------------------------------------------

describe("GET /api/logs", () => {
  let logsDb: LogDatabase;
  let logsApp: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    logsDb = new LogDatabase();
    await logsDb.initialize(":memory:");
    logsApp = createApiApp(logsDb);

    const logs = [
      makeLog({ _id: 1n, level: "INFO", service: "api", message: "request started", source: "proc-1", timestamp: new Date("2026-01-15T10:00:00Z") }),
      makeLog({ _id: 2n, level: "ERROR", service: "api", message: "connection failed", source: "proc-1", timestamp: new Date("2026-01-15T10:01:00Z") }),
      makeLog({ _id: 3n, level: "WARN", service: "worker", message: "slow query detected", source: "proc-2", timestamp: new Date("2026-01-15T10:02:00Z") }),
      makeLog({ _id: 4n, level: "INFO", service: "worker", message: "task completed", source: "proc-2", timestamp: new Date("2026-01-15T10:03:00Z") }),
      makeLog({ _id: 5n, level: "ERROR", service: "api", message: "timeout error", source: "proc-1", timestamp: new Date("2026-01-15T10:04:00Z") }),
    ];
    await logsDb.insertBatch(logs);
  });

  afterAll(async () => {
    if (logsDb) await logsDb.close();
  });

  // Base startTime used across tests (before all log timestamps)
  const baseStartTime = "startTime=2026-01-15T09:00:00Z";

  it("returns logs with startTime and default parameters", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toBeDefined();
    expect(body.total).toBe(5);
    expect(Array.isArray(body.logs)).toBe(true);
  });

  it("filters by level", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&level=ERROR`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.logs.every((l: { level: string }) => l.level === "ERROR")).toBe(true);
  });

  it("filters by service", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&service=worker`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
  });

  it("filters by source", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&source=proc-1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
  });

  it("filters by search term", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&search=timeout`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
  });

  it("filters by time range", async () => {
    const res = await logsApp.request(
      "/api/logs?startTime=2026-01-15T10:01:00Z&endTime=2026-01-15T10:03:00Z"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
  });

  it("respects limit and offset", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&limit=2&offset=1&order=asc`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it("orders by asc", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&order=asc&limit=5`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // First log should have earliest timestamp
    expect(body.logs[0].message).toBe("request started");
  });

  it("orders by desc (default)", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&limit=5`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // First log should have latest timestamp
    expect(body.logs[0].message).toBe("timeout error");
  });

  it("ignores invalid level values and returns 200", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&level=INVALID`);
    expect(res.status).toBe(200);
    // Invalid level is filtered out, so no level filter is applied
    const body = await res.json();
    expect(body.total).toBe(5); // All logs returned
  });

  it("returns 400 for invalid limit", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&limit=0`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit exceeding max", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&limit=99999`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative offset", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&offset=-1`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid order", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&order=random`);
    expect(res.status).toBe(400);
  });

  it("combines multiple filters (level + service + source)", async () => {
    const res = await logsApp.request(`/api/logs?${baseStartTime}&level=ERROR&service=api&source=proc-1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(
      body.logs.every(
        (l: { level: string; service: string; source: string }) =>
          l.level === "ERROR" && l.service === "api" && l.source === "proc-1"
      )
    ).toBe(true);
  });

  it("returns 400 for invalid startTime format", async () => {
    const res = await logsApp.request("/api/logs?startTime=not-a-date");
    expect(res.status).toBe(400);
  });

  // --- Task 1.1: startTime required, limit max 1000, endTime default ---

  it("returns 400 VALIDATION_ERROR when startTime is not provided", async () => {
    const res = await logsApp.request("/api/logs");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when limit exceeds 1000", async () => {
    const res = await logsApp.request(
      "/api/logs?startTime=2026-01-15T09:00:00Z&limit=1001"
    );
    expect(res.status).toBe(400);
  });

  it("accepts limit of exactly 1000", async () => {
    const res = await logsApp.request(
      "/api/logs?startTime=2026-01-15T09:00:00Z&limit=1000"
    );
    expect(res.status).toBe(200);
  });

  it("returns logs when startTime is provided without endTime", async () => {
    const res = await logsApp.request(
      "/api/logs?startTime=2026-01-15T09:00:00Z"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toBeDefined();
    // All 5 logs are after startTime, so they should be returned
    expect(body.total).toBe(5);
  });

  it("uses server current time as endTime when endTime is not provided", async () => {
    // Logs have timestamps in 2026-01-15T10:00:00Z - 2026-01-15T10:04:00Z range.
    // With startTime far in the past and no endTime, the server should use
    // current time (which is after all log timestamps), so all logs are returned.
    const res = await logsApp.request(
      "/api/logs?startTime=2020-01-01T00:00:00Z"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(5);
  });

  it("does not return future logs when endTime defaults to now", async () => {
    // Insert a log with a far-future timestamp
    const futureDb = new LogDatabase();
    await futureDb.initialize(":memory:");
    const futureApp = createApiApp(futureDb);

    const logs = [
      makeLog({ _id: 100n, message: "past log", timestamp: new Date("2020-01-01T00:00:00Z") }),
      makeLog({ _id: 101n, message: "future log", timestamp: new Date("2099-01-01T00:00:00Z") }),
    ];
    await futureDb.insertBatch(logs);

    const res = await futureApp.request(
      "/api/logs?startTime=2019-01-01T00:00:00Z"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only the past log should be returned since endTime defaults to now
    expect(body.total).toBe(1);
    expect(body.logs[0].message).toBe("past log");

    await futureDb.close();
  });

  // --- Task 1.1: exportSchema is NOT changed (limit=10000 maintained) ---

  // Note: exportSchema does not have a limit field in validation; the handler
  // hardcodes limit=10000, so no validation test needed here. The key assertion
  // is that logQuerySchema rejects limit>1000 while export still works.
});

// ---------------------------------------------------------------------------
// 4.2 - POST /api/query
// ---------------------------------------------------------------------------

describe("POST /api/query", () => {
  let queryDb: LogDatabase;
  let queryApp: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    queryDb = new LogDatabase();
    await queryDb.initialize(":memory:");
    queryApp = createApiApp(queryDb);

    const logs = [
      makeLog({ _id: 1n, level: "INFO" }),
      makeLog({ _id: 2n, level: "ERROR" }),
    ];
    await queryDb.insertBatch(logs);
  });

  afterAll(async () => {
    if (queryDb) await queryDb.close();
  });

  it("executes a SELECT query", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT _id, level FROM logs ORDER BY _id" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.columns).toEqual(["_id", "level"]);
    expect(body.rows).toHaveLength(2);
  });

  it("executes a WITH query", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: "WITH cte AS (SELECT level, COUNT(*) as cnt FROM logs GROUP BY level) SELECT * FROM cte ORDER BY cnt DESC",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.columns).toBeDefined();
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it("executes an EXPLAIN query", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "EXPLAIN SELECT * FROM logs" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.columns.length).toBeGreaterThan(0);
  });

  it("rejects DELETE with 403", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "DELETE FROM logs" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN_SQL");
  });

  it("rejects INSERT with 403", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "INSERT INTO logs (_id) VALUES (99)" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects DROP with 403", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "DROP TABLE logs" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty sql", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing sql field", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects UPDATE with 403", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "UPDATE logs SET level = 'FATAL'" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN_SQL");
  });

  it("rejects ALTER TABLE with 403", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "ALTER TABLE logs ADD COLUMN extra VARCHAR" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN_SQL");
  });

  it("rejects TRUNCATE with 403", async () => {
    const res = await queryApp.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "TRUNCATE TABLE logs" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN_SQL");
  });
});

// ---------------------------------------------------------------------------
// 4.2 - POST /api/export
// ---------------------------------------------------------------------------

describe("POST /api/export", () => {
  let exportDb: LogDatabase;
  let exportApp: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    exportDb = new LogDatabase();
    await exportDb.initialize(":memory:");
    exportApp = createApiApp(exportDb);

    const logs = [
      makeLog({ _id: 1n, level: "INFO", service: "api", message: "request started", timestamp: new Date("2026-01-15T10:00:00Z") }),
      makeLog({ _id: 2n, level: "ERROR", service: "api", message: "connection failed", timestamp: new Date("2026-01-15T10:01:00Z") }),
      makeLog({ _id: 3n, level: "WARN", service: "worker", message: "slow query", timestamp: new Date("2026-01-15T10:02:00Z") }),
    ];
    await exportDb.insertBatch(logs);
  });

  afterAll(async () => {
    if (exportDb) await exportDb.close();
  });

  it("exports logs as CSV with proper Content-Type", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(4); // 1 header + 3 data rows
    expect(lines[0]).toContain("_id");
  });

  it("exports logs as JSON with proper Content-Type", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "json" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3);
  });

  it("exports filtered logs", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", level: "ERROR" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2); // 1 header + 1 filtered row
  });

  it("exports with source filter", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "json", source: "default" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(3);
  });

  it("returns 400 for invalid format", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "xml" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing format", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("sets Content-Disposition header for CSV", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv" }),
    });
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain(".csv");
  });

  it("sets Content-Disposition header for JSON", async () => {
    const res = await exportApp.request("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "json" }),
    });
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain(".json");
  });
});

// ---------------------------------------------------------------------------
// 4.2 - GET /api/facets
// ---------------------------------------------------------------------------

describe("GET /api/facets", () => {
  let facetDb: LogDatabase;
  let facetApp: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    facetDb = new LogDatabase();
    await facetDb.initialize(":memory:");
    facetApp = createApiApp(facetDb);

    const logs = [
      makeLog({ _id: 1n, level: "INFO", service: "api", source: "proc-1", _raw: JSON.stringify({ level: "INFO", metadata: { region: "us-east" } }) }),
      makeLog({ _id: 2n, level: "ERROR", service: "api", source: "proc-1", _raw: JSON.stringify({ level: "ERROR", metadata: { region: "us-east" } }) }),
      makeLog({ _id: 3n, level: "INFO", service: "worker", source: "proc-2", _raw: JSON.stringify({ level: "INFO", metadata: { region: "eu-west" } }) }),
      makeLog({ _id: 4n, level: "WARN", service: "worker", source: "proc-2", _raw: JSON.stringify({ level: "WARN", metadata: { region: "us-east" } }) }),
    ];
    await facetDb.insertBatch(logs);
  });

  afterAll(async () => {
    if (facetDb) await facetDb.close();
  });

  it("returns facet distribution for a standard column", async () => {
    const res = await facetApp.request("/api/facets?field=level");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.field).toBe("level");
    expect(Array.isArray(body.values)).toBe(true);
    expect(body.values.length).toBe(3); // INFO, ERROR, WARN
  });

  it("returns facet distribution for a nested JSON path", async () => {
    const res = await facetApp.request(
      "/api/facets?field=metadata.region&jsonPath=metadata.region"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.field).toBe("metadata.region");

    const usEast = body.values.find((v: { value: string }) => v.value === "us-east");
    expect(usEast?.count).toBe(3);
  });

  it("applies filters to facet query", async () => {
    const res = await facetApp.request("/api/facets?field=level&service=api");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.values.length).toBe(2); // INFO, ERROR (only api service)
  });

  it("applies source filter to facets", async () => {
    const res = await facetApp.request("/api/facets?field=level&source=proc-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.values.length).toBe(2); // INFO, ERROR (only proc-1)
  });

  it("returns 400 for missing field parameter", async () => {
    const res = await facetApp.request("/api/facets");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/histogram", () => {
  let histogramDb: LogDatabase;
  let histogramApp: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    histogramDb = new LogDatabase();
    await histogramDb.initialize(":memory:");
    histogramApp = createApiApp(histogramDb);

    const logs = [
      makeLog({ _id: 1n, level: "info", service: "api", timestamp: new Date("2026-01-15T10:00:10Z") }),
      makeLog({ _id: 2n, level: "ERROR", service: "api", timestamp: new Date("2026-01-15T10:00:40Z") }),
      makeLog({ _id: 3n, level: "WARN", service: "worker", timestamp: new Date("2026-01-15T10:01:05Z") }),
    ];
    await histogramDb.insertBatch(logs);
  });

  afterAll(async () => {
    if (histogramDb) await histogramDb.close();
  });

  it("returns histogram buckets and interval", async () => {
    const res = await histogramApp.request(
      "/api/histogram?buckets=3&startTime=2026-01-15T10:00:00.000Z&endTime=2026-01-15T10:03:00.000Z",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.interval).toBe("1 minute");
    expect(Array.isArray(body.buckets)).toBe(true);
    expect(body.buckets.length).toBe(3);
  });

  it("applies filters to histogram query", async () => {
    const res = await histogramApp.request(
      "/api/histogram?buckets=3&service=worker&startTime=2026-01-15T10:00:00.000Z&endTime=2026-01-15T10:03:00.000Z",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const bucket = body.buckets.find((b: { timestamp: string }) => b.timestamp === "2026-01-15T10:01:00.000Z");
    expect(bucket?.counts.WARN).toBe(1);
  });

  it("returns 400 for invalid buckets value", async () => {
    const res = await histogramApp.request("/api/histogram?buckets=1000");
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/ingest
// ---------------------------------------------------------------------------

describe("POST /api/ingest", () => {
  let ingestDb: LogDatabase;
  let ingester: Ingester;
  let ingestApp: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    ingestDb = new LogDatabase();
    await ingestDb.initialize(":memory:");
    ingester = new Ingester(ingestDb, {
      batchSize: 5000,
      flushIntervalMs: 500,
      maxRows: 100_000,
      defaultSource: "http",
    });
    ingester.startTimer();
    ingestApp = createApiApp(ingestDb, ingester);
  });

  afterAll(async () => {
    await ingester.stop();
    if (ingestDb) await ingestDb.close();
  });

  it("accepts a single log object", async () => {
    const res = await ingestApp.request("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "single log", level: "INFO" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  it("accepts an array of log objects", async () => {
    const res = await ingestApp.request("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { message: "log1", level: "INFO" },
        { message: "log2", level: "ERROR" },
        { message: "log3", level: "WARN" },
      ]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(3);
  });

  it("ingested logs are queryable from the database", async () => {
    // Wait for flush
    await ingester.stop();
    ingester.startTimer();

    const result = await ingestDb.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBeGreaterThanOrEqual(4); // 1 single + 3 batch from above
  });

  it("returns 503 when ingester is not provided", async () => {
    const noIngesterApp = createApiApp(ingestDb);
    const res = await noIngesterApp.request("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test" }),
    });
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid body (string)", async () => {
    const res = await ingestApp.request("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '"just a string"',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  it("returns 404 for unknown endpoints", async () => {
    const res = await app.request("/api/unknown");
    expect(res.status).toBe(404);
  });

  it("returns error format with code and message for query errors", async () => {
    const queryDb2 = new LogDatabase();
    await queryDb2.initialize(":memory:");
    const queryApp2 = createApiApp(queryDb2);

    const res = await queryApp2.request("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM nonexistent_table" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("QUERY_ERROR");
    expect(typeof body.error.message).toBe("string");

    await queryDb2.close();
  });
});
