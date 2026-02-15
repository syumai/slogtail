import { EventEmitter } from "node:events";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { LogDatabase } from "./db";
import type { NormalizedLog, IngesterOptions } from "../types";
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

  constructor(db: LogDatabase, options: IngesterOptions) {
    this.db = db;
    this.options = options;
  }

  // -------------------------------------------------------------------------
  // Public API: IngesterService interface
  // -------------------------------------------------------------------------

  start(input: NodeJS.ReadableStream): void {
    this.stopped = false;

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

    this.resetFlushTimer();
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

  // -------------------------------------------------------------------------
  // Line processing
  // -------------------------------------------------------------------------

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed === "") return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Invalid JSON - skip
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return;
    }

    const normalized = this.normalize(parsed, trimmed);
    this.buffer.push(normalized);

    if (this.buffer.length >= this.options.batchSize) {
      this.flushBuffer();
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

    this.flushing = this.doFlush(batch);
  }

  private async doFlush(batch: NormalizedLog[]): Promise<void> {
    try {
      await this.db.insertBatch(batch);
      await this.db.evictOldRows(this.options.maxRows);
      this.emitter.emit("batch", batch);
    } catch {
      // Log error but don't crash
      // In production this would go to stderr
    } finally {
      this.flushing = null;
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
        this.flushBuffer();
      }, this.options.flushIntervalMs);
    }
  }
}
