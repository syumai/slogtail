import { describe, it, expect } from "vitest";
import {
  FIELD_MAPPINGS,
  LOG_LEVELS,
  ERROR_CODES,
  resolveField,
} from "./types";
import type {
  NormalizedLog,
  LogEntry,
  LogQueryParams,
  LogStats,
  FacetDistribution,
  FacetDefinition,
  SchemaColumn,
  WSClientMessage,
  WSServerMessage,
  WSFilter,
  ErrorResponse,
  ErrorCode,
  LogLevel,
  IngesterOptions,
  CLIOptions,
  FieldMapping,
} from "./types";

describe("FIELD_MAPPINGS", () => {
  it("contains timestamp field candidates", () => {
    expect(FIELD_MAPPINGS.timestamp).toContain("timestamp");
    expect(FIELD_MAPPINGS.timestamp).toContain("ts");
    expect(FIELD_MAPPINGS.timestamp).toContain("time");
    expect(FIELD_MAPPINGS.timestamp).toContain("@timestamp");
    expect(FIELD_MAPPINGS.timestamp).toContain("datetime");
  });

  it("contains level field candidates", () => {
    expect(FIELD_MAPPINGS.level).toContain("level");
    expect(FIELD_MAPPINGS.level).toContain("severity");
    expect(FIELD_MAPPINGS.level).toContain("loglevel");
    expect(FIELD_MAPPINGS.level).toContain("lvl");
    expect(FIELD_MAPPINGS.level).toContain("priority");
  });

  it("contains message field candidates", () => {
    expect(FIELD_MAPPINGS.message).toContain("message");
    expect(FIELD_MAPPINGS.message).toContain("msg");
    expect(FIELD_MAPPINGS.message).toContain("body");
    expect(FIELD_MAPPINGS.message).toContain("text");
  });

  it("contains service field candidates", () => {
    expect(FIELD_MAPPINGS.service).toContain("service");
    expect(FIELD_MAPPINGS.service).toContain("svc");
    expect(FIELD_MAPPINGS.service).toContain("app");
    expect(FIELD_MAPPINGS.service).toContain("component");
    expect(FIELD_MAPPINGS.service).toContain("logger");
  });

  it("contains trace_id field candidates", () => {
    expect(FIELD_MAPPINGS.trace_id).toContain("trace_id");
    expect(FIELD_MAPPINGS.trace_id).toContain("traceId");
    expect(FIELD_MAPPINGS.trace_id).toContain("request_id");
    expect(FIELD_MAPPINGS.trace_id).toContain("correlation_id");
  });

  it("covers all five standard fields", () => {
    const fields = Object.keys(FIELD_MAPPINGS);
    expect(fields).toEqual([
      "timestamp",
      "level",
      "message",
      "service",
      "trace_id",
    ]);
  });

  it("each field has at least one candidate", () => {
    for (const [field, candidates] of Object.entries(FIELD_MAPPINGS)) {
      expect(candidates.length).toBeGreaterThan(0);
      // The canonical name should be the first candidate
      expect(candidates[0]).toBe(field);
    }
  });

  it("all candidate arrays are readonly", () => {
    // Ensure FIELD_MAPPINGS values are arrays (readonly at type level)
    for (const candidates of Object.values(FIELD_MAPPINGS)) {
      expect(Array.isArray(candidates)).toBe(true);
    }
  });
});

describe("resolveField", () => {
  it("resolves canonical field names", () => {
    expect(resolveField("timestamp")).toBe("timestamp");
    expect(resolveField("level")).toBe("level");
    expect(resolveField("message")).toBe("message");
    expect(resolveField("service")).toBe("service");
    expect(resolveField("trace_id")).toBe("trace_id");
  });

  it("resolves timestamp aliases", () => {
    expect(resolveField("ts")).toBe("timestamp");
    expect(resolveField("time")).toBe("timestamp");
    expect(resolveField("@timestamp")).toBe("timestamp");
    expect(resolveField("datetime")).toBe("timestamp");
  });

  it("resolves level aliases", () => {
    expect(resolveField("severity")).toBe("level");
    expect(resolveField("loglevel")).toBe("level");
    expect(resolveField("lvl")).toBe("level");
    expect(resolveField("priority")).toBe("level");
  });

  it("resolves message aliases", () => {
    expect(resolveField("msg")).toBe("message");
    expect(resolveField("body")).toBe("message");
    expect(resolveField("text")).toBe("message");
  });

  it("resolves service aliases", () => {
    expect(resolveField("svc")).toBe("service");
    expect(resolveField("app")).toBe("service");
    expect(resolveField("component")).toBe("service");
    expect(resolveField("logger")).toBe("service");
  });

  it("resolves trace_id aliases", () => {
    expect(resolveField("traceId")).toBe("trace_id");
    expect(resolveField("request_id")).toBe("trace_id");
    expect(resolveField("correlation_id")).toBe("trace_id");
  });

  it("returns null for unknown field names", () => {
    expect(resolveField("unknown_field")).toBeNull();
    expect(resolveField("foo")).toBeNull();
    expect(resolveField("")).toBeNull();
  });
});

describe("LOG_LEVELS", () => {
  it("contains all five standard log levels", () => {
    expect(LOG_LEVELS).toEqual(["DEBUG", "INFO", "WARN", "ERROR", "FATAL"]);
  });

  it("is a readonly array", () => {
    expect(Array.isArray(LOG_LEVELS)).toBe(true);
  });
});

describe("ERROR_CODES", () => {
  it("contains all four error codes", () => {
    expect(ERROR_CODES).toEqual([
      "VALIDATION_ERROR",
      "FORBIDDEN_SQL",
      "QUERY_ERROR",
      "INTERNAL_ERROR",
    ]);
  });

  it("is a readonly array", () => {
    expect(Array.isArray(ERROR_CODES)).toBe(true);
  });
});

describe("Type compatibility", () => {
  it("NormalizedLog has correct shape", () => {
    const log: NormalizedLog = {
      _id: 1n,
      _ingested: new Date(),
      _raw: '{"msg":"test"}',
      timestamp: new Date(),
      level: "INFO",
      message: "test",
      service: "api",
      trace_id: "abc-123",
      host: "localhost",
      duration_ms: 42,
      source: "default",
    };
    expect(log._id).toBe(1n);
    expect(log.source).toBe("default");
  });

  it("NormalizedLog allows null fields", () => {
    const log: NormalizedLog = {
      _id: 2n,
      _ingested: new Date(),
      _raw: "{}",
      timestamp: null,
      level: null,
      message: null,
      service: null,
      trace_id: null,
      host: null,
      duration_ms: null,
      source: "default",
    };
    expect(log.timestamp).toBeNull();
    expect(log.level).toBeNull();
  });

  it("LogEntry has _raw as object", () => {
    const entry: LogEntry = {
      _id: 1n,
      _ingested: new Date(),
      _raw: { msg: "test", extra: 42 },
      timestamp: new Date(),
      level: "ERROR",
      message: "test",
      service: "api",
      trace_id: null,
      host: null,
      duration_ms: null,
      source: "default",
    };
    expect(entry._raw).toEqual({ msg: "test", extra: 42 });
  });

  it("LogQueryParams has correct defaults shape", () => {
    const params: LogQueryParams = {
      limit: 200,
      offset: 0,
      order: "desc",
    };
    expect(params.level).toBeUndefined();
    expect(params.limit).toBe(200);
  });

  it("LogQueryParams accepts all optional fields", () => {
    const params: LogQueryParams = {
      level: ["ERROR"],
      service: ["api"],
      source: ["default"],
      search: "connection",
      startTime: new Date("2026-01-01"),
      endTime: new Date("2026-12-31"),
      limit: 100,
      offset: 10,
      order: "asc",
    };
    expect(params.level).toEqual(["ERROR"]);
    expect(params.source).toEqual(["default"]);
    expect(params.search).toBe("connection");
  });

  it("LogStats has correct shape", () => {
    const stats: LogStats = {
      total: 1000,
      byLevel: { DEBUG: 100, INFO: 500, WARN: 200, ERROR: 150, FATAL: 50 },
      errorRate: 0.2,
      timeRange: { min: new Date(), max: new Date() },
      ingestionRate: 0,
    };
    expect(stats.total).toBe(1000);
    expect(stats.errorRate).toBe(0.2);
  });

  it("LogStats allows null time range", () => {
    const stats: LogStats = {
      total: 0,
      byLevel: {},
      errorRate: 0,
      timeRange: { min: null, max: null },
      ingestionRate: 0,
    };
    expect(stats.timeRange.min).toBeNull();
    expect(stats.timeRange.max).toBeNull();
  });

  it("FacetDistribution has correct shape", () => {
    const dist: FacetDistribution = {
      field: "level",
      values: [
        { value: "INFO", count: 500 },
        { value: "ERROR", count: 100 },
      ],
    };
    expect(dist.field).toBe("level");
    expect(dist.values).toHaveLength(2);
    expect(dist.values[0].value).toBe("INFO");
    expect(dist.values[0].count).toBe(500);
  });

  it("FacetDefinition has correct shape", () => {
    const defaultFacet: FacetDefinition = {
      field: "level",
      displayName: "Log Level",
      jsonPath: null,
      isDefault: true,
    };
    expect(defaultFacet.field).toBe("level");
    expect(defaultFacet.jsonPath).toBeNull();
    expect(defaultFacet.isDefault).toBe(true);

    const customFacet: FacetDefinition = {
      field: "metadata.region",
      displayName: "Region",
      jsonPath: "metadata.region",
      isDefault: false,
    };
    expect(customFacet.jsonPath).toBe("metadata.region");
    expect(customFacet.isDefault).toBe(false);
  });

  it("SchemaColumn has correct shape", () => {
    const col: SchemaColumn = {
      name: "level",
      type: "VARCHAR",
      nullable: true,
    };
    expect(col.name).toBe("level");
    expect(col.type).toBe("VARCHAR");
    expect(col.nullable).toBe(true);
  });

  it("WSClientMessage filter message", () => {
    const msg: WSClientMessage = {
      type: "filter",
      filter: { level: ["ERROR"], service: ["api"] },
    };
    expect(msg.type).toBe("filter");
  });

  it("WSClientMessage filter with source", () => {
    const msg: WSClientMessage = {
      type: "filter",
      filter: { level: ["WARN"], source: ["worker"] },
    };
    expect(msg.filter.source).toEqual(["worker"]);
  });

  it("WSFilter can be used independently", () => {
    const filter: WSFilter = {
      level: ["DEBUG"],
      service: ["auth"],
      source: ["process-1"],
    };
    expect(filter.level).toEqual(["DEBUG"]);
    expect(filter.service).toEqual(["auth"]);
    expect(filter.source).toEqual(["process-1"]);
  });

  it("WSFilter can be empty", () => {
    const filter: WSFilter = {};
    expect(filter.level).toBeUndefined();
    expect(filter.service).toBeUndefined();
    expect(filter.source).toBeUndefined();
  });

  it("WSServerMessage logs variant", () => {
    const msg: WSServerMessage = {
      type: "logs",
      data: [],
    };
    expect(msg.type).toBe("logs");
  });

  it("WSServerMessage stats variant", () => {
    const msg: WSServerMessage = {
      type: "stats",
      data: {
        total: 100,
        byLevel: { INFO: 80, ERROR: 20 },
        errorRate: 0.2,
        timeRange: { min: new Date(), max: new Date() },
        ingestionRate: 0,
      },
    };
    expect(msg.type).toBe("stats");
  });

  it("ErrorResponse has correct shape", () => {
    const err: ErrorResponse = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { field: "level" },
      },
    };
    expect(err.error.code).toBe("VALIDATION_ERROR");
  });

  it("ErrorResponse with all error codes", () => {
    const codes: ErrorCode[] = [
      "VALIDATION_ERROR",
      "FORBIDDEN_SQL",
      "QUERY_ERROR",
      "INTERNAL_ERROR",
    ];
    for (const code of codes) {
      const err: ErrorResponse = {
        error: { code, message: `Error: ${code}` },
      };
      expect(err.error.code).toBe(code);
    }
  });

  it("ErrorResponse without details", () => {
    const err: ErrorResponse = {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      },
    };
    expect(err.error.details).toBeUndefined();
  });

  it("LogLevel type matches LOG_LEVELS values", () => {
    const levels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
    expect(levels).toEqual(LOG_LEVELS);
  });

  it("IngesterOptions has correct shape with all fields", () => {
    const opts: IngesterOptions = {
      batchSize: 5000,
      flushIntervalMs: 500,
      maxRows: 100000,
      defaultSource: "default",
    };
    expect(opts.batchSize).toBe(5000);
    expect(opts.flushIntervalMs).toBe(500);
    expect(opts.maxRows).toBe(100000);
    expect(opts.defaultSource).toBe("default");
  });

  it("CLIOptions has correct shape with all fields", () => {
    const opts: CLIOptions = {
      port: 8080,
      maxRows: 100000,
      batchSize: 5000,
      db: ":memory:",
      noUi: false,
    };
    expect(opts.port).toBe(8080);
    expect(opts.db).toBe(":memory:");
    expect(opts.noUi).toBe(false);
  });

  it("FieldMapping type is compatible with FIELD_MAPPINGS", () => {
    const mapping: FieldMapping = FIELD_MAPPINGS;
    expect(Object.keys(mapping)).toHaveLength(5);
  });
});
