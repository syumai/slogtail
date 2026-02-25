// Shared type definitions and field normalization mappings

// --- Log Levels ---

export const LOG_LEVELS = [
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "FATAL",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

// --- Error Codes ---

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "FORBIDDEN_SQL",
  "QUERY_ERROR",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// --- Normalized Log (internal representation after ingestion) ---

export interface NormalizedLog {
  _id: bigint;
  _ingested: Date;
  _raw: string;
  timestamp: Date | null;
  level: string | null;
  message: string | null;
  service: string | null;
  trace_id: string | null;
  host: string | null;
  duration_ms: number | null;
  source: string;
}

// --- Log Entry (API response representation) ---

export interface LogEntry {
  _id: bigint;
  _ingested: Date;
  _raw: Record<string, unknown>;
  timestamp: Date | null;
  level: string | null;
  message: string | null;
  service: string | null;
  trace_id: string | null;
  host: string | null;
  duration_ms: number | null;
  source: string;
}

// --- Query Parameters ---

export interface LogQueryParams {
  level?: LogLevel[];
  service?: string[];
  host?: string[];
  source?: string[];
  search?: string;
  startTime?: Date;
  endTime?: Date;
  limit: number;
  offset: number;
  order: "asc" | "desc";
  /** Custom facet filters: jsonPath -> selected values (OR within same key) */
  jsonFilters?: Record<string, string[]>;
}

// --- Statistics ---

export interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  errorRate: number;
  timeRange: { min: Date | null; max: Date | null };
}

// --- Facet Distribution ---

export interface FacetDistribution {
  field: string;
  values: Array<{ value: string; count: number }>;
}

// --- Facet Definition ---

export interface FacetDefinition {
  field: string;
  displayName: string;
  jsonPath: string | null; // null = standard column, string = _raw JSON path
  isDefault: boolean;
}

// --- Schema Column ---

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
}

// --- Field Normalization Mapping ---

export type FieldMapping = Record<string, ReadonlyArray<string>>;

export const FIELD_MAPPINGS: FieldMapping = {
  timestamp: ["timestamp", "ts", "time", "@timestamp", "datetime"],
  level: ["level", "severity", "loglevel", "lvl", "priority"],
  message: ["message", "msg", "body", "text"],
  service: ["service", "svc", "app", "component", "logger"],
  trace_id: ["trace_id", "traceId", "request_id", "correlation_id"],
};

// Pre-computed reverse lookup: alias -> canonical field name
const REVERSE_FIELD_MAP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(FIELD_MAPPINGS)) {
    for (const alias of aliases) {
      map.set(alias, canonical);
    }
  }
  return map;
})();

/**
 * Resolve a JSON field name alias to its canonical normalized field name.
 * Returns null if the field name is not recognized.
 */
export function resolveField(fieldName: string): string | null {
  return REVERSE_FIELD_MAP.get(fieldName) ?? null;
}

// --- WebSocket Protocol ---

export type WSFilter = {
  level?: LogLevel[];
  service?: string[];
  host?: string[];
  source?: string[];
  search?: string;
};

// Client -> Server
export type WSClientMessage = {
  type: "filter";
  filter: WSFilter;
};

// Server -> Client
export type WSServerMessage =
  | { type: "logs"; data: LogEntry[] }
  | { type: "stats"; data: LogStats };

// --- Error Response ---

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

// --- Ingestion Stats ---

export interface IngestionStats {
  /** Recent ingestion rate (logs/second) */
  ingestionRate: number;
  /** Timestamp of the last batch flush */
  lastBatchTime: Date | null;
}

// --- Ingester Options ---

export interface IngesterOptions {
  batchSize: number;
  flushIntervalMs: number;
  maxRows: number;
  defaultSource: string;
}

// --- CLI Options ---

export interface CLIOptions {
  port: number;
  maxRows: number;
  batchSize: number;
  db: string;
  noUi: boolean;
}
