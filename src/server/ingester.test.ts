import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Readable } from "node:stream";
import { Ingester } from "./ingester";
import { LogDatabase } from "./db";
import type { NormalizedLog, IngesterOptions } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createReadableFromLines(lines: string[]): Readable {
  const stream = new Readable({
    read() {
      for (const line of lines) {
        this.push(line + "\n");
      }
      this.push(null);
    },
  });
  return stream;
}

function createSlowReadable(lines: string[], intervalMs: number): Readable {
  let index = 0;
  return new Readable({
    read() {
      if (index < lines.length) {
        const line = lines[index++];
        setTimeout(() => {
          this.push(line + "\n");
          if (index >= lines.length) {
            this.push(null);
          }
        }, intervalMs);
      }
    },
  });
}

const defaultOptions: IngesterOptions = {
  batchSize: 5,
  flushIntervalMs: 500,
  maxRows: 100,
  defaultSource: "default",
};

// ---------------------------------------------------------------------------
// JSON Parsing and Field Normalization
// ---------------------------------------------------------------------------

describe("Ingester - JSON parsing", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, defaultOptions);
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
  });

  it("parses valid JSON lines and inserts into database", async () => {
    const lines = [
      JSON.stringify({ message: "hello", level: "INFO" }),
      JSON.stringify({ message: "world", level: "ERROR" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch).toHaveLength(2);
    expect(batch[0].message).toBe("hello");
    expect(batch[0].level).toBe("INFO");
    expect(batch[1].message).toBe("world");
    expect(batch[1].level).toBe("ERROR");
  });

  it("skips invalid JSON lines and continues processing", async () => {
    const lines = [
      JSON.stringify({ message: "valid1", level: "INFO" }),
      "this is not valid json",
      JSON.stringify({ message: "valid2", level: "WARN" }),
      "{broken json",
      JSON.stringify({ message: "valid3", level: "DEBUG" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    // Only 3 valid lines should be processed
    expect(batch).toHaveLength(3);
    expect(batch[0].message).toBe("valid1");
    expect(batch[1].message).toBe("valid2");
    expect(batch[2].message).toBe("valid3");
  });

  it("skips empty lines", async () => {
    const lines = [
      JSON.stringify({ message: "line1", level: "INFO" }),
      "",
      "  ",
      JSON.stringify({ message: "line2", level: "INFO" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Field Normalization Mapping
// ---------------------------------------------------------------------------

describe("Ingester - field normalization", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, defaultOptions);
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
  });

  it("maps standard field names correctly", async () => {
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-15T10:00:00Z",
        level: "INFO",
        message: "standard fields",
        service: "api",
        trace_id: "abc-123",
      }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].timestamp).toEqual(new Date("2026-01-15T10:00:00Z"));
    expect(batch[0].level).toBe("INFO");
    expect(batch[0].message).toBe("standard fields");
    expect(batch[0].service).toBe("api");
    expect(batch[0].trace_id).toBe("abc-123");
  });

  it("maps aliased field names to canonical names", async () => {
    const lines = [
      JSON.stringify({
        ts: "2026-01-15T10:00:00Z",
        severity: "ERROR",
        msg: "aliased fields",
        svc: "worker",
        traceId: "xyz-456",
      }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].timestamp).toEqual(new Date("2026-01-15T10:00:00Z"));
    expect(batch[0].level).toBe("ERROR");
    expect(batch[0].message).toBe("aliased fields");
    expect(batch[0].service).toBe("worker");
    expect(batch[0].trace_id).toBe("xyz-456");
  });

  it("maps @timestamp alias", async () => {
    const lines = [
      JSON.stringify({
        "@timestamp": "2026-02-10T08:30:00Z",
        lvl: "WARN",
        body: "body text",
        app: "myapp",
        request_id: "req-001",
      }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].timestamp).toEqual(new Date("2026-02-10T08:30:00Z"));
    expect(batch[0].level).toBe("WARN");
    expect(batch[0].message).toBe("body text");
    expect(batch[0].service).toBe("myapp");
    expect(batch[0].trace_id).toBe("req-001");
  });

  it("maps host field directly (not in FIELD_MAPPINGS)", async () => {
    const lines = [
      JSON.stringify({ message: "test", host: "server-1" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].host).toBe("server-1");
  });

  it("maps duration_ms field directly", async () => {
    const lines = [
      JSON.stringify({ message: "test", duration_ms: 42.5 }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].duration_ms).toBe(42.5);
  });

  it("sets null for missing fields", async () => {
    const lines = [
      JSON.stringify({ random: "data" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].timestamp).toBeNull();
    expect(batch[0].level).toBeNull();
    expect(batch[0].message).toBeNull();
    expect(batch[0].service).toBeNull();
    expect(batch[0].trace_id).toBeNull();
    expect(batch[0].host).toBeNull();
    expect(batch[0].duration_ms).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// _id, _ingested, _raw, and source assignment
// ---------------------------------------------------------------------------

describe("Ingester - metadata fields", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, defaultOptions);
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
  });

  it("assigns monotonically increasing _id (BIGINT)", async () => {
    const lines = [
      JSON.stringify({ message: "first" }),
      JSON.stringify({ message: "second" }),
      JSON.stringify({ message: "third" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0]._id).toBe(1n);
    expect(batch[1]._id).toBe(2n);
    expect(batch[2]._id).toBe(3n);
  });

  it("assigns _ingested timestamp to each log", async () => {
    const now = new Date();
    const lines = [JSON.stringify({ message: "test" })];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0]._ingested).toBeInstanceOf(Date);
    // Should be close to now (within 5 seconds)
    expect(batch[0]._ingested.getTime()).toBeGreaterThanOrEqual(now.getTime() - 1000);
    expect(batch[0]._ingested.getTime()).toBeLessThanOrEqual(now.getTime() + 5000);
  });

  it("stores raw JSON string in _raw", async () => {
    const rawObj = { message: "test", extra: { nested: true }, count: 42 };
    const lines = [JSON.stringify(rawObj)];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0]._raw).toBe(JSON.stringify(rawObj));
  });

  it("assigns default source when not present in JSON", async () => {
    const lines = [JSON.stringify({ message: "no source" })];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].source).toBe("default");
  });

  it("uses source from JSON when present", async () => {
    const lines = [JSON.stringify({ message: "with source", source: "my-process" })];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].source).toBe("my-process");
  });

  it("uses custom default source from options", async () => {
    const customIngester = new Ingester(db, {
      ...defaultOptions,
      defaultSource: "custom-source",
    });

    const lines = [JSON.stringify({ message: "test" })];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      customIngester.on("batch", (logs) => resolve(logs));
    });

    customIngester.start(stream);
    const batch = await batchPromise;

    expect(batch[0].source).toBe("custom-source");

    await customIngester.stop();
  });
});

// ---------------------------------------------------------------------------
// Batch INSERT on batch-size threshold
// ---------------------------------------------------------------------------

describe("Ingester - batch-size triggered flush", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    vi.useFakeTimers();
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, { ...defaultOptions, batchSize: 3 });
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
    vi.useRealTimers();
  });

  it("flushes when buffer reaches batch-size", async () => {
    const lines = [
      JSON.stringify({ message: "msg1" }),
      JSON.stringify({ message: "msg2" }),
      JSON.stringify({ message: "msg3" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);

    // Let readline process lines
    await vi.runAllTimersAsync();

    const batch = await batchPromise;
    expect(batch).toHaveLength(3);

    // Verify data is in the database
    const result = await db.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBe(3);
  });

  it("emits multiple batches for data exceeding batch-size", async () => {
    const ingesterWith2 = new Ingester(db, { ...defaultOptions, batchSize: 2 });

    const lines = [
      JSON.stringify({ message: "msg1" }),
      JSON.stringify({ message: "msg2" }),
      JSON.stringify({ message: "msg3" }),
      JSON.stringify({ message: "msg4" }),
      JSON.stringify({ message: "msg5" }),
    ];
    const stream = createReadableFromLines(lines);

    const batches: ReadonlyArray<NormalizedLog>[] = [];
    ingesterWith2.on("batch", (logs) => {
      batches.push(logs);
    });

    ingesterWith2.start(stream);

    // Let readline process all lines and flush timers
    await vi.runAllTimersAsync();
    // Wait for stream end and flush
    await ingesterWith2.stop();

    // With batchSize=2 and 5 lines: should get 2 batches of 2 + 1 batch of 1 (or similar)
    const totalLogs = batches.reduce((sum, b) => sum + b.length, 0);
    expect(totalLogs).toBe(5);
    expect(batches.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Timer-based flush (500ms)
// ---------------------------------------------------------------------------

describe("Ingester - timer-based flush", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    vi.useFakeTimers();
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, {
      ...defaultOptions,
      batchSize: 100, // Large batch size so timer triggers first
      flushIntervalMs: 500,
    });
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
    vi.useRealTimers();
  });

  it("flushes remaining rows after flush interval elapses", async () => {
    // Create a stream that stays open (does not push null immediately)
    const stream = new Readable({
      read() {
        // Don't push anything automatically
      },
    });

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);

    // Push some lines (less than batchSize)
    stream.push(JSON.stringify({ message: "partial1" }) + "\n");
    stream.push(JSON.stringify({ message: "partial2" }) + "\n");

    // Process pending readline events
    await vi.advanceTimersByTimeAsync(100);

    // Advance past the flush interval
    await vi.advanceTimersByTimeAsync(500);

    const batch = await batchPromise;
    expect(batch).toHaveLength(2);

    // Verify data in database
    const result = await db.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBe(2);

    // Clean up
    stream.push(null);
  });
});

// ---------------------------------------------------------------------------
// Batch event emission
// ---------------------------------------------------------------------------

describe("Ingester - batch event", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, defaultOptions);
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
  });

  it("emits batch event with NormalizedLog array after INSERT", async () => {
    const lines = [
      JSON.stringify({ message: "test", level: "INFO", service: "api" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    expect(Array.isArray(batch)).toBe(true);
    expect(batch[0]).toHaveProperty("_id");
    expect(batch[0]).toHaveProperty("_ingested");
    expect(batch[0]).toHaveProperty("_raw");
    expect(batch[0]).toHaveProperty("message");
    expect(batch[0]).toHaveProperty("level");
    expect(batch[0]).toHaveProperty("service");
    expect(batch[0]).toHaveProperty("source");
  });

  it("batch payload matches inserted data", async () => {
    const lines = [
      JSON.stringify({ message: "hello", level: "ERROR", service: "worker" }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<ReadonlyArray<NormalizedLog>>((resolve) => {
      ingester.on("batch", (logs) => resolve(logs));
    });

    ingester.start(stream);
    const batch = await batchPromise;

    // Verify the batch payload matches what was inserted into DB
    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.logs[0].message).toBe("hello");
    expect(result.logs[0].level).toBe("ERROR");
    expect(result.logs[0].service).toBe("worker");

    // Batch payload should match
    expect(batch[0].message).toBe("hello");
    expect(batch[0].level).toBe("ERROR");
    expect(batch[0].service).toBe("worker");
  });
});

// ---------------------------------------------------------------------------
// Max-rows eviction
// ---------------------------------------------------------------------------

describe("Ingester - max-rows eviction", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, {
      ...defaultOptions,
      batchSize: 5,
      maxRows: 5,
    });
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
  });

  it("evicts old rows when max-rows is exceeded", async () => {
    const lines = Array.from({ length: 8 }, (_, i) =>
      JSON.stringify({ message: `msg${i + 1}`, level: "INFO" })
    );
    const stream = createReadableFromLines(lines);

    const batches: ReadonlyArray<NormalizedLog>[] = [];
    ingester.on("batch", (logs) => {
      batches.push(logs);
    });

    ingester.start(stream);
    await ingester.stop();

    // After eviction, should have at most maxRows entries
    const result = await db.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Stop / cleanup
// ---------------------------------------------------------------------------

describe("Ingester - stop", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, {
      ...defaultOptions,
      batchSize: 100, // Large batch size so data stays in buffer
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it("flushes remaining buffer on stop", async () => {
    const lines = [
      JSON.stringify({ message: "unflushed1" }),
      JSON.stringify({ message: "unflushed2" }),
    ];
    const stream = createReadableFromLines(lines);

    ingester.start(stream);

    // Wait a bit for readline to process
    await new Promise((r) => setTimeout(r, 50));

    // Stop should flush
    await ingester.stop();

    const result = await db.queryLogs({ limit: 100, offset: 0, order: "asc" });
    expect(result.total).toBe(2);
    expect(result.logs[0].message).toBe("unflushed1");
    expect(result.logs[1].message).toBe("unflushed2");
  });

  it("stop is safe to call multiple times", async () => {
    const lines = [JSON.stringify({ message: "test" })];
    const stream = createReadableFromLines(lines);

    ingester.start(stream);
    await new Promise((r) => setTimeout(r, 50));

    await ingester.stop();
    // Second stop should not throw
    await ingester.stop();
  });

  it("stop resolves even when no data was ingested", async () => {
    // Never started
    await expect(ingester.stop()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration with LogDatabase
// ---------------------------------------------------------------------------

describe("Ingester - database integration", () => {
  let db: LogDatabase;
  let ingester: Ingester;

  beforeEach(async () => {
    db = new LogDatabase();
    await db.initialize(":memory:");
    ingester = new Ingester(db, defaultOptions);
  });

  afterEach(async () => {
    await ingester.stop();
    await db.close();
  });

  it("inserted logs are queryable from the database", async () => {
    const lines = [
      JSON.stringify({
        timestamp: "2026-01-15T10:00:00Z",
        level: "INFO",
        message: "request started",
        service: "api",
        host: "server-1",
        duration_ms: 150,
        source: "proc-1",
      }),
      JSON.stringify({
        ts: "2026-01-15T10:01:00Z",
        severity: "ERROR",
        msg: "connection failed",
        svc: "api",
        host: "server-2",
      }),
    ];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<void>((resolve) => {
      ingester.on("batch", () => resolve());
    });

    ingester.start(stream);
    await batchPromise;

    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    expect(result.total).toBe(2);

    const log1 = result.logs[0];
    expect(log1.level).toBe("INFO");
    expect(log1.message).toBe("request started");
    expect(log1.service).toBe("api");
    expect(log1.host).toBe("server-1");
    expect(log1.duration_ms).toBe(150);
    expect(log1.source).toBe("proc-1");

    const log2 = result.logs[1];
    expect(log2.level).toBe("ERROR");
    expect(log2.message).toBe("connection failed");
    expect(log2.service).toBe("api");
    expect(log2.host).toBe("server-2");
    expect(log2.source).toBe("default");
  });

  it("preserves raw JSON for all fields including non-standard ones", async () => {
    const rawObj = {
      message: "test",
      custom_field: "custom_value",
      nested: { deep: true },
    };
    const lines = [JSON.stringify(rawObj)];
    const stream = createReadableFromLines(lines);

    const batchPromise = new Promise<void>((resolve) => {
      ingester.on("batch", () => resolve());
    });

    ingester.start(stream);
    await batchPromise;

    const result = await db.queryLogs({ limit: 10, offset: 0, order: "asc" });
    // _raw should contain the original JSON with all fields
    expect(result.logs[0]._raw).toEqual(rawObj);
  });
});
