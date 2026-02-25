import { EventEmitter } from "node:events";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { LogDatabase } from "./db";
import type { NormalizedLog, IngesterOptions, IngestionStats } from "../types";
import { resolveField } from "../types";

// ---------------------------------------------------------------------------
// Ingester
// ---------------------------------------------------------------------------

export class Ingester {
  private readonly db: LogDatabase;
  private readonly options: IngesterOptions;
  private readonly emitter = new EventEmitter();

  private nextId = 1n;
  private buffer: NormalizedLog[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private rl: ReadlineInterface | null = null;
  private stopped = false;
  private flushing: Promise<void> | null = null;

  // Sliding window for ingestion rate calculation
  private static readonly RATE_WINDOW_MS = 10_000; // 10 seconds
  private batchRecords: Array<{ timestamp: number; size: number }> = [];
  private lastBatchTime: Date | null = null;

  constructor(db: LogDatabase, options: IngesterOptions) {
    this.db = db;
    this.options = options;
  }

  // -------------------------------------------------------------------------
  // Public API: IngesterService interface
  // -------------------------------------------------------------------------

  /**
   * Start the periodic flush timer without binding to a readable stream.
   * Use this when ingesting logs via `ingestLines()` (e.g. HTTP endpoint).
   */
  startTimer(): void {
    this.stopped = false;
    this.resetFlushTimer();
  }

  /**
   * Feed JSON lines directly (without a stream).
   * Each string is processed through the same normalization pipeline as stdin.
   */
  ingestLines(lines: string[]): void {
    for (const line of lines) {
      this.handleLine(line);
    }
    // Ensure the flush timer is running (it stops after an empty-buffer flush)
    if (this.flushTimer === null && !this.stopped) {
      this.resetFlushTimer();
    }
  }

  start(input: NodeJS.ReadableStream): void {
    this.startTimer();

    this.rl = createInterface({
      input: input as NodeJS.ReadableStream,
      crlfDelay: Infinity,
    });

    this.rl.on("line", (line: string) => {
      this.handleLine(line);
    });

    this.rl.on("close", () => {
      // Stream ended; flush remaining buffer
      this.flushBuffer();
    });
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    // Clear the flush timer
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Close readline interface
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    // Wait for any in-progress flush
    if (this.flushing) {
      await this.flushing;
    }

    // Flush remaining buffer
    await this.flushBuffer();
  }

  on(event: "batch", listener: (logs: ReadonlyArray<NormalizedLog>) => void): void {
    this.emitter.on(event, listener);
  }

  /**
   * Returns the current ingestion statistics including the smoothed
   * ingestion rate (logs/second) over a 10-second sliding window.
   */
  getIngestionStats(): IngestionStats {
    const now = Date.now();
    const windowStart = now - Ingester.RATE_WINDOW_MS;

    // Prune expired records outside the window
    this.batchRecords = this.batchRecords.filter(
      (r) => r.timestamp >= windowStart,
    );

    // Sum logs within the window
    const totalLogs = this.batchRecords.reduce((sum, r) => sum + r.size, 0);

    // Rate = total logs in window / window duration in seconds
    const ingestionRate = totalLogs / (Ingester.RATE_WINDOW_MS / 1000);

    return {
      ingestionRate,
      lastBatchTime: this.lastBatchTime,
    };
  }

  // -------------------------------------------------------------------------
  // Line processing
  // -------------------------------------------------------------------------

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed === "") return;

    let parsed: Record<string, unknown>;
    let raw: string;
    try {
      parsed = JSON.parse(trimmed);
      raw = trimmed;
    } catch {
      // Non-JSON line: wrap as plain-text log entry
      parsed = { message: trimmed, level: "INFO", timestamp: new Date().toISOString() };
      raw = JSON.stringify(parsed);
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return;
    }

    const normalized = this.normalize(parsed, raw);
    this.buffer.push(normalized);

    if (this.buffer.length >= this.options.batchSize) {
      this.flushBuffer();
    } else if (this.flushTimer === null && !this.stopped) {
      this.resetFlushTimer();
    }
  }

  // -------------------------------------------------------------------------
  // Normalization
  // -------------------------------------------------------------------------

  private normalize(obj: Record<string, unknown>, raw: string): NormalizedLog {
    const resolved: Record<string, unknown> = {};

    // Resolve aliased fields using FIELD_MAPPINGS
    for (const [key, value] of Object.entries(obj)) {
      const canonical = resolveField(key);
      if (canonical !== null && !(canonical in resolved)) {
        resolved[canonical] = value;
      }
    }

    // Parse timestamp
    let timestamp: Date | null = null;
    if (resolved.timestamp !== undefined && resolved.timestamp !== null) {
      const d = new Date(resolved.timestamp as string | number);
      if (!isNaN(d.getTime())) {
        timestamp = d;
      }
    }

    // Parse duration_ms directly from raw object
    let duration_ms: number | null = null;
    if (obj.duration_ms !== undefined && obj.duration_ms !== null) {
      const n = Number(obj.duration_ms);
      if (!isNaN(n)) {
        duration_ms = n;
      }
    }

    // Determine source
    const source =
      typeof obj.source === "string" && obj.source !== ""
        ? obj.source
        : this.options.defaultSource;

    // Determine host
    const host =
      typeof obj.host === "string" && obj.host !== "" ? obj.host : null;

    const id = this.nextId++;

    return {
      _id: id,
      _ingested: new Date(),
      _raw: raw,
      timestamp,
      level: typeof resolved.level === "string" ? resolved.level : null,
      message: typeof resolved.message === "string" ? resolved.message : null,
      service: typeof resolved.service === "string" ? resolved.service : null,
      trace_id: typeof resolved.trace_id === "string" ? resolved.trace_id : null,
      host,
      duration_ms,
      source,
    };
  }

  // -------------------------------------------------------------------------
  // Buffer flush
  // -------------------------------------------------------------------------

  private flushBuffer(): void {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.slice();
    this.buffer = [];

    this.resetFlushTimer();

    // Chain flushes to avoid concurrent insertBatch calls
    const prev = this.flushing ?? Promise.resolve();
    this.flushing = prev.then(() => this.doFlush(batch));
  }

  private async doFlush(batch: NormalizedLog[]): Promise<void> {
    try {
      await this.db.insertBatch(batch);
      await this.db.evictOldRows(this.options.maxRows);

      // Record batch for ingestion rate calculation
      const now = Date.now();
      this.batchRecords.push({ timestamp: now, size: batch.length });
      this.lastBatchTime = new Date(now);

      this.emitter.emit("batch", batch);
    } catch (err) {
      console.error("[ingester] doFlush error:", err);
    }
  }

  // -------------------------------------------------------------------------
  // Flush timer management
  // -------------------------------------------------------------------------

  private resetFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
    }

    if (!this.stopped) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushBuffer();
      }, this.options.flushIntervalMs);
    }
  }
}
