import { DuckDBInstance, DuckDBConnection, DuckDBTimestampValue } from "@duckdb/node-api";
import type { DuckDBAppender } from "@duckdb/node-api";
import type {
  NormalizedLog,
  LogEntry,
  LogQueryParams,
  LogStats,
  FacetDistribution,
  HistogramResponse,
  SchemaColumn,
} from "../types";

// ---------------------------------------------------------------------------
// Search Query Parsing
// ---------------------------------------------------------------------------

/** Parsed search query result */
export interface ParsedSearch {
  /** null = cross-field search, string = field-specific search */
  field: string | null;
  value: string;
}

/** Valid field names for field:value search syntax */
const SEARCHABLE_FIELDS = new Set([
  "message",
  "service",
  "host",
  "trace_id",
  "level",
]);

/**
 * Parse a search query string into a structured ParsedSearch.
 *
 * Supports `field:value` syntax for field-specific searches.
 * Falls back to plain text cross-field search when:
 * - The field name is not recognized
 * - The field name is empty (e.g., ":value")
 * - The value is empty (e.g., "host:")
 * - The query contains spaces before the colon
 */
export function parseSearchQuery(search: string): ParsedSearch {
  const colonIndex = search.indexOf(":");
  if (colonIndex <= 0) {
    // No colon, or colon is at position 0 (e.g., ":value")
    return { field: null, value: search };
  }

  const field = search.substring(0, colonIndex);
  const value = search.substring(colonIndex + 1);

  // Field name must not contain spaces
  if (field.includes(" ")) {
    return { field: null, value: search };
  }

  // Value must not be empty
  if (value === "") {
    return { field: null, value: search };
  }

  // Field must be a recognized searchable field
  if (!SEARCHABLE_FIELDS.has(field)) {
    return { field: null, value: search };
  }

  return { field, value };
}

// ---------------------------------------------------------------------------
// SQL Constants
// ---------------------------------------------------------------------------

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS logs (
    _id         BIGINT PRIMARY KEY,
    _ingested   TIMESTAMP DEFAULT current_timestamp,
    _raw        JSON,
    timestamp   TIMESTAMP,
    level       VARCHAR,
    message     VARCHAR,
    service     VARCHAR,
    trace_id    VARCHAR,
    host        VARCHAR,
    duration_ms DOUBLE,
    source      VARCHAR DEFAULT 'default'
);
`;

const CREATE_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_level   ON logs(level);",
  "CREATE INDEX IF NOT EXISTS idx_ts      ON logs(timestamp DESC);",
  "CREATE INDEX IF NOT EXISTS idx_service ON logs(service);",
  "CREATE INDEX IF NOT EXISTS idx_source  ON logs(source);",
];

const LOG_COLUMNS = "_id, _ingested, _raw, timestamp, level, message, service, trace_id, host, duration_ms, source";

const ALLOWED_SQL_KEYWORDS = ["SELECT", "WITH", "EXPLAIN"];

// ---------------------------------------------------------------------------
// LogDatabase class
// ---------------------------------------------------------------------------

export class LogDatabase {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(dbPath: string): Promise<void> {
    if (dbPath === ":memory:") {
      this.instance = await DuckDBInstance.create();
    } else {
      this.instance = await DuckDBInstance.create(dbPath);
    }
    this.connection = await this.instance.connect();

    await this.connection.run(CREATE_TABLE_SQL);
    for (const sql of CREATE_INDEXES_SQL) {
      await this.connection.run(sql);
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.closeSync();
      this.connection = null;
    }
    if (this.instance) {
      this.instance.closeSync();
      this.instance = null;
    }
  }

  private getConnection(): DuckDBConnection {
    if (!this.connection) {
      throw new Error("Database is not initialized or has been closed");
    }
    return this.connection;
  }

  // -------------------------------------------------------------------------
  // Batch INSERT
  // -------------------------------------------------------------------------

  async insertBatch(logs: ReadonlyArray<NormalizedLog>): Promise<void> {
    if (logs.length === 0) return;

    const conn = this.getConnection();
    const appender = await conn.createAppender("logs");

    for (const log of logs) {
      appender.appendBigInt(log._id);
      appender.appendTimestamp(dateToTimestamp(log._ingested));
      appender.appendVarchar(log._raw);
      appendNullableTimestamp(appender, log.timestamp);
      appendNullableVarchar(appender, log.level);
      appendNullableVarchar(appender, log.message);
      appendNullableVarchar(appender, log.service);
      appendNullableVarchar(appender, log.trace_id);
      appendNullableVarchar(appender, log.host);
      appendNullableDouble(appender, log.duration_ms);
      appender.appendVarchar(log.source);
      appender.endRow();
    }

    appender.flushSync();
    appender.closeSync();
  }

  // -------------------------------------------------------------------------
  // Eviction
  // -------------------------------------------------------------------------

  async evictOldRows(maxRows: number): Promise<void> {
    const conn = this.getConnection();
    await conn.run(
      `DELETE FROM logs WHERE _id <= (SELECT MAX(_id) - ${maxRows} FROM logs)`
    );
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  async queryLogs(params: LogQueryParams): Promise<{ logs: LogEntry[]; total: number }> {
    const conn = this.getConnection();
    const whereClause = buildWhereClause(params);

    // Total count
    const countReader = await conn.runAndReadAll(
      `SELECT COUNT(*) FROM logs ${whereClause}`
    );
    const total = Number(countReader.getRowsJS()[0][0]);

    // Paginated results
    const orderDir = params.order === "asc" ? "ASC" : "DESC";
    const dataReader = await conn.runAndReadAll(
      `SELECT ${LOG_COLUMNS} FROM logs ${whereClause}
       ORDER BY timestamp ${orderDir} NULLS LAST, _id ${orderDir}
       LIMIT ${params.limit} OFFSET ${params.offset}`
    );

    const logs = dataReader.getRowsJS().map(rowToLogEntry);
    return { logs, total };
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async getStats(params?: { source?: string }): Promise<LogStats> {
    const conn = this.getConnection();
    const whereClause = params?.source
      ? `WHERE source = '${escapeSql(params.source)}'`
      : "";

    // Total count
    const totalReader = await conn.runAndReadAll(
      `SELECT COUNT(*) FROM logs ${whereClause}`
    );
    const total = Number(totalReader.getRowsJS()[0][0]);

    if (total === 0) {
      return {
        total: 0,
        byLevel: {},
        errorRate: 0,
        timeRange: { min: null, max: null },
        ingestionRate: 0,
      };
    }

    // Level counts (case-insensitive grouping via UPPER)
    const levelWhereClause = whereClause
      ? `${whereClause} AND level IS NOT NULL`
      : "WHERE level IS NOT NULL";
    const levelReader = await conn.runAndReadAll(
      `SELECT UPPER(level) as lvl, COUNT(*) as cnt FROM logs ${levelWhereClause} GROUP BY lvl ORDER BY cnt DESC`
    );
    const byLevel: Record<string, number> = {};
    for (const row of levelReader.getRowsJS()) {
      byLevel[row[0] as string] = Number(row[1]);
    }

    // Error rate: (ERROR + FATAL) / total
    const errorCount = (byLevel["ERROR"] ?? 0) + (byLevel["FATAL"] ?? 0);
    const errorRate = errorCount / total;

    // Time range
    const timeReader = await conn.runAndReadAll(
      `SELECT MIN(timestamp), MAX(timestamp) FROM logs ${whereClause}`
    );
    const timeRow = timeReader.getRowsJS()[0];

    return {
      total,
      byLevel,
      errorRate,
      timeRange: {
        min: timeRow[0] !== null ? jsToDate(timeRow[0]) : null,
        max: timeRow[1] !== null ? jsToDate(timeRow[1]) : null,
      },
      ingestionRate: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Facets
  // -------------------------------------------------------------------------

  async getFacetDistribution(
    field: string,
    jsonPath: string | null,
    filters: Partial<LogQueryParams>
  ): Promise<FacetDistribution> {
    const conn = this.getConnection();

    // Determine the column expression
    const columnExpr = jsonPath !== null
      ? `CAST(json_extract(_raw, '${escapeSql("$." + jsonPath)}') AS VARCHAR)`
      : `"${field}"`;

    // For the level field, use UPPER() to normalize case variations
    const isLevelField = field === "level" && jsonPath === null;
    const selectExpr = isLevelField ? `UPPER(${columnExpr})` : columnExpr;

    // Build WHERE conditions from filters, plus exclude NULLs
    const conditions = buildFilterConditions(filters);
    conditions.push(`${columnExpr} IS NOT NULL`);
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const reader = await conn.runAndReadAll(
      `SELECT ${selectExpr} as val, COUNT(*) as cnt FROM logs ${whereClause} GROUP BY val ORDER BY cnt DESC, val ASC`
    );

    const values = reader.getRowsJS().map((row) => {
      let value = String(row[0]);
      // json_extract may return quoted strings like '"us-east"'
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      return { value, count: Number(row[1]) };
    });

    return { field, values };
  }

  // -------------------------------------------------------------------------
  // Histogram
  // -------------------------------------------------------------------------

  async getHistogram(
    params: Partial<LogQueryParams> & {
      buckets?: number;
      startTime?: Date;
      endTime?: Date;
    },
  ): Promise<HistogramResponse> {
    const conn = this.getConnection();

    const buckets = Math.min(360, Math.max(1, Math.floor(params.buckets ?? 30)));
    const endTime = params.endTime ?? new Date();
    const startTime = params.startTime ?? new Date(endTime.getTime() - 60 * 60 * 1000);
    const rangeStartMs = Math.min(startTime.getTime(), endTime.getTime());
    const rangeEndMs = Math.max(startTime.getTime(), endTime.getTime());
    const spanMs = Math.max(1000, rangeEndMs - rangeStartMs);
    const rawIntervalMs = Math.max(1000, Math.floor(spanMs / buckets));
    const interval = intervalMsToIntervalString(rawIntervalMs);
    const normalizedMs = normalizeIntervalMs(rawIntervalMs);
    const actualBuckets = Math.ceil(spanMs / normalizedMs);

    // Align the start to a normalizedMs boundary so JS and DuckDB agree.
    // We pass this aligned start as the explicit origin to DuckDB's time_bucket.
    const alignedStart = Math.floor(rangeStartMs / normalizedMs) * normalizedMs;
    const origin = new Date(alignedStart).toISOString();

    const conditions = buildFilterConditions({
      ...params,
      startTime: new Date(rangeStartMs),
      endTime: new Date(rangeEndMs),
    });
    conditions.push("timestamp IS NOT NULL");
    conditions.push("level IS NOT NULL");
    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const reader = await conn.runAndReadAll(
      `SELECT
         time_bucket(INTERVAL '${interval}', timestamp, TIMESTAMP '${origin}') AS bucket,
         UPPER(level) AS lvl,
         COUNT(*) AS cnt
       FROM logs
       ${whereClause}
       GROUP BY bucket, lvl
       ORDER BY bucket ASC`,
    );

    const countsByBucket = new Map<string, Record<string, number>>();
    for (const row of reader.getRowsJS()) {
      const bucketIso = jsToDate(row[0]).toISOString();
      const level = String(row[1]);
      const count = Number(row[2]);
      const current = countsByBucket.get(bucketIso) ?? {};
      current[level] = count;
      countsByBucket.set(bucketIso, current);
    }

    const histogramBuckets = Array.from({ length: actualBuckets }, (_, i) => {
      const timestamp = new Date(alignedStart + i * normalizedMs).toISOString();
      return {
        timestamp,
        counts: countsByBucket.get(timestamp) ?? {},
      };
    });

    return {
      buckets: histogramBuckets,
      interval,
    };
  }

  // -------------------------------------------------------------------------
  // Custom SQL Execution
  // -------------------------------------------------------------------------

  async executeQuery(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
    const conn = this.getConnection();

    // Whitelist check: only SELECT, WITH, EXPLAIN are allowed
    const firstKeyword = sql.trimStart().split(/\s+/)[0].toUpperCase();
    if (!ALLOWED_SQL_KEYWORDS.includes(firstKeyword)) {
      throw new Error(
        `Forbidden SQL: only SELECT, WITH, and EXPLAIN statements are allowed. Got: ${firstKeyword}`
      );
    }

    const reader = await conn.runAndReadAll(sql);
    const columns = reader.columnNames();
    const rows = reader.getRowsJS().map((row) =>
      row.map((val) => (typeof val === "bigint" ? Number(val) : val))
    );

    return { columns, rows };
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  async exportLogs(
    params: LogQueryParams,
    format: "csv" | "json"
  ): Promise<ReadableStream<Uint8Array>> {
    const conn = this.getConnection();
    const whereClause = buildWhereClause(params);
    const orderDir = params.order === "asc" ? "ASC" : "DESC";

    const reader = await conn.runAndReadAll(
      `SELECT ${LOG_COLUMNS} FROM logs ${whereClause}
       ORDER BY timestamp ${orderDir} NULLS LAST, _id ${orderDir}
       LIMIT ${params.limit} OFFSET ${params.offset}`
    );

    const columns = reader.columnNames();
    const rows = reader.getRowsJS();
    const encoder = new TextEncoder();

    if (format === "csv") {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(columns.join(",") + "\n"));
          for (const row of rows) {
            controller.enqueue(
              encoder.encode(row.map(csvEscape).join(",") + "\n")
            );
          }
          controller.close();
        },
      });
    }

    // JSON format
    const jsonRows = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        let val = row[i];
        if (typeof val === "bigint") val = Number(val);
        if (columns[i] === "_raw" && typeof val === "string") {
          try { val = JSON.parse(val); } catch { /* keep as string */ }
        }
        obj[columns[i]] = val;
      }
      return obj;
    });

    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify(jsonRows)));
        controller.close();
      },
    });
  }

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  async getSchema(): Promise<SchemaColumn[]> {
    const conn = this.getConnection();
    const reader = await conn.runAndReadAll(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'logs' ORDER BY ordinal_position"
    );
    return reader.getRowsJS().map((row) => ({
      name: row[0] as string,
      type: row[1] as string,
      nullable: row[2] === "YES",
    }));
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function dateToTimestamp(date: Date): DuckDBTimestampValue {
  return new DuckDBTimestampValue(BigInt(date.getTime()) * 1000n);
}

function jsToDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return new Date(String(value));
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function intervalMsToIntervalString(intervalMs: number): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const secondMs = 1000;

  if (intervalMs % dayMs === 0) {
    const days = Math.max(1, Math.floor(intervalMs / dayMs));
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (intervalMs % hourMs === 0) {
    const hours = Math.max(1, Math.floor(intervalMs / hourMs));
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (intervalMs % minuteMs === 0) {
    const minutes = Math.max(1, Math.floor(intervalMs / minuteMs));
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const seconds = Math.max(1, Math.floor(intervalMs / secondMs));
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

/**
 * Convert intervalMs to the same granularity that the SQL interval string uses.
 *
 * `intervalMsToIntervalString()` truncates fractional units (e.g. 7500 ms → "7 seconds").
 * When JS generates bucket timestamps using the *original* intervalMs, those timestamps
 * won't align with DuckDB's `time_bucket()` output, creating gaps.
 *
 * This helper round-trips through the interval string so that both sides use the same value.
 */
export function normalizeIntervalMs(intervalMs: number): number {
  const interval = intervalMsToIntervalString(intervalMs);
  const match = interval.match(/^(\d+)\s+(\w+)$/);
  if (!match) return intervalMs;

  const value = parseInt(match[1], 10);
  const unit = match[2].replace(/s$/, ""); // strip trailing 's' for plural forms

  switch (unit) {
    case "day":
      return value * 24 * 60 * 60 * 1000;
    case "hour":
      return value * 60 * 60 * 1000;
    case "minute":
      return value * 60 * 1000;
    case "second":
      return value * 1000;
    case "millisecond":
      return value;
    default:
      return intervalMs;
  }
}

// ---------------------------------------------------------------------------
// Appender helpers for nullable fields
// ---------------------------------------------------------------------------

function appendNullableVarchar(appender: DuckDBAppender, value: string | null): void {
  if (value !== null) {
    appender.appendVarchar(value);
  } else {
    appender.appendNull();
  }
}

function appendNullableTimestamp(appender: DuckDBAppender, value: Date | null): void {
  if (value !== null) {
    appender.appendTimestamp(dateToTimestamp(value));
  } else {
    appender.appendNull();
  }
}

function appendNullableDouble(appender: DuckDBAppender, value: number | null): void {
  if (value !== null) {
    appender.appendDouble(value);
  } else {
    appender.appendNull();
  }
}

// ---------------------------------------------------------------------------
// WHERE clause builders (shared across queryLogs, getFacetDistribution, exportLogs)
// ---------------------------------------------------------------------------

function buildArrayCondition(column: string, values: string[], caseInsensitive = false): string {
  if (caseInsensitive) {
    const upperValues = values.map((v) => v.toUpperCase());
    if (upperValues.length === 1) {
      return `UPPER(${column}) = '${escapeSql(upperValues[0])}'`;
    }
    const escaped = upperValues.map((v) => `'${escapeSql(v)}'`).join(", ");
    return `UPPER(${column}) IN (${escaped})`;
  }
  if (values.length === 1) {
    return `${column} = '${escapeSql(values[0])}'`;
  }
  const escaped = values.map((v) => `'${escapeSql(v)}'`).join(", ");
  return `${column} IN (${escaped})`;
}

function buildFilterConditions(params: Partial<LogQueryParams>): string[] {
  const conditions: string[] = [];
  if (params.level && params.level.length > 0) {
    conditions.push(buildArrayCondition("level", params.level, true));
  }
  if (params.service && params.service.length > 0) {
    conditions.push(buildArrayCondition("service", params.service));
  }
  if (params.host && params.host.length > 0) {
    conditions.push(buildArrayCondition("host", params.host));
  }
  if (params.source && params.source.length > 0) {
    conditions.push(buildArrayCondition("source", params.source));
  }
  if (params.search) {
    const parsed = parseSearchQuery(params.search);
    if (parsed.field !== null) {
      // Field-specific search: field ILIKE '%value%'
      conditions.push(`${parsed.field} ILIKE '%${escapeSql(parsed.value)}%'`);
    } else {
      // Cross-field search: OR across message, service, host, trace_id, and _raw
      const kw = escapeSql(parsed.value);
      conditions.push(
        `(message ILIKE '%${kw}%' OR service ILIKE '%${kw}%' OR host ILIKE '%${kw}%' OR trace_id ILIKE '%${kw}%' OR CAST(_raw AS VARCHAR) ILIKE '%${kw}%')`
      );
    }
  }
  if (params.startTime) {
    conditions.push(`timestamp >= '${params.startTime.toISOString()}'`);
  }
  if (params.endTime) {
    conditions.push(`timestamp <= '${params.endTime.toISOString()}'`);
  }
  if (params.jsonFilters) {
    for (const [jsonPath, values] of Object.entries(params.jsonFilters)) {
      const expr = `CAST(json_extract(_raw, '${escapeSql("$." + jsonPath)}') AS VARCHAR)`;
      if (values.length > 0) {
        conditions.push(buildArrayCondition(expr, values));
      }
    }
  }
  return conditions;
}

function buildWhereClause(params: Partial<LogQueryParams>): string {
  const conditions = buildFilterConditions(params);
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

// ---------------------------------------------------------------------------
// Row conversion helper
// ---------------------------------------------------------------------------

function rowToLogEntry(row: unknown[]): LogEntry {
  let rawParsed: Record<string, unknown>;
  if (typeof row[2] === "string") {
    try {
      const parsed = JSON.parse(row[2]);
      rawParsed = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed
        : { _value: parsed };
    } catch {
      rawParsed = { message: row[2] };
    }
  } else {
    rawParsed = (row[2] as Record<string, unknown>) ?? {};
  }

  return {
    _id: BigInt(row[0] as number | bigint),
    _ingested: jsToDate(row[1]),
    _raw: rawParsed,
    timestamp: row[3] !== null ? jsToDate(row[3]) : null,
    level: row[4] as string | null,
    message: row[5] as string | null,
    service: row[6] as string | null,
    trace_id: row[7] as string | null,
    host: row[8] as string | null,
    duration_ms: row[9] as number | null,
    source: row[10] as string,
  };
}
