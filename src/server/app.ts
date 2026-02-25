import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { LogDatabase } from "./db";
import type { Ingester } from "./ingester";
import type { ErrorResponse, LogLevel, LogQueryParams } from "../types";
import { LOG_LEVELS } from "../types";

// ---------------------------------------------------------------------------
// Helpers: comma-separated value parsing
// ---------------------------------------------------------------------------

function splitLevels(csv: string | undefined): LogLevel[] | undefined {
  if (!csv) return undefined;
  const levels = csv.split(",").filter((v) => (LOG_LEVELS as readonly string[]).includes(v)) as LogLevel[];
  return levels.length > 0 ? levels : undefined;
}

function splitStrings(csv: string | undefined): string[] | undefined {
  if (!csv) return undefined;
  const values = csv.split(",").filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseJsonFilters(raw: string | undefined): Record<string, string[]> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        result[key] = value.map(String);
      } else if (typeof value === "string") {
        // Backward compatibility: single string values
        result[key] = [value];
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const logQuerySchema = z.object({
  level: z.string().optional(),
  service: z.string().optional(),
  host: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(["asc", "desc"]).default("desc"),
  jsonFilters: z.string().optional(),
});

const statsQuerySchema = z.object({
  source: z.string().optional(),
});

const sqlQuerySchema = z.object({
  sql: z.string().min(1).max(10000),
});

const exportSchema = z.object({
  format: z.enum(["csv", "json"]),
  level: z.string().optional(),
  service: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});

const ingestBodySchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())),
]);

const facetQuerySchema = z.object({
  field: z.string(),
  jsonPath: z.string().optional(),
  level: z.string().optional(),
  service: z.string().optional(),
  host: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  jsonFilters: z.string().optional(),
});

const histogramQuerySchema = z.object({
  buckets: z.coerce.number().int().min(1).max(60).default(30),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  level: z.string().optional(),
  service: z.string().optional(),
  host: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  jsonFilters: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Validation error hook (returns 400 with ErrorResponse format)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod v4 $ZodError is incompatible with zod-validator's Hook type
function validationHook(result: { success: boolean; error?: any }, c: { json: (data: ErrorResponse, status: number) => Response }) {
  if (!result.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR" as const,
          message: "Invalid request parameters",
          details: result.error?.issues,
        },
      },
      400,
    );
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function serializeLogEntry(log: { _id: bigint; _ingested: Date; _raw: Record<string, unknown>; timestamp: Date | null; level: string | null; message: string | null; service: string | null; trace_id: string | null; host: string | null; duration_ms: number | null; source: string }) {
  return {
    _id: String(log._id),
    _ingested: log._ingested.toISOString(),
    _raw: log._raw,
    timestamp: log.timestamp?.toISOString() ?? null,
    level: log.level,
    message: log.message,
    service: log.service,
    trace_id: log.trace_id,
    host: log.host,
    duration_ms: log.duration_ms,
    source: log.source,
  };
}

function serializeStats(stats: { total: number; byLevel: Record<string, number>; errorRate: number; timeRange: { min: Date | null; max: Date | null }; ingestionRate: number }) {
  return {
    total: stats.total,
    byLevel: stats.byLevel,
    errorRate: stats.errorRate,
    timeRange: {
      min: stats.timeRange.min?.toISOString() ?? null,
      max: stats.timeRange.max?.toISOString() ?? null,
    },
    ingestionRate: stats.ingestionRate,
  };
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export function createApiApp(db: LogDatabase, ingester?: Ingester) {
  const startTime = Date.now();

  const app = new Hono()
    .basePath("/api")

    // ----- GET /api/health -----
    .get("/health", (c) => {
      const uptime = (Date.now() - startTime) / 1000;
      return c.json({ status: "ok" as const, uptime });
    })

    // ----- GET /api/schema -----
    .get("/schema", async (c) => {
      try {
        const schema = await db.getSchema();
        return c.json(schema);
      } catch (err) {
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR" as const,
              message: err instanceof Error ? err.message : "Unknown error",
            },
          },
          500,
        );
      }
    })

    // ----- GET /api/stats -----
    .get("/stats", zValidator("query", statsQuerySchema, validationHook), async (c) => {
      try {
        const { source } = c.req.valid("query");
        const stats = await db.getStats(source ? { source } : undefined);
        if (ingester) {
          const ingestionStats = ingester.getIngestionStats();
          stats.ingestionRate = ingestionStats.ingestionRate;
        }
        return c.json(serializeStats(stats));
      } catch (err) {
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR" as const,
              message: err instanceof Error ? err.message : "Unknown error",
            },
          },
          500,
        );
      }
    })

    // ----- GET /api/logs -----
    .get("/logs", zValidator("query", logQuerySchema, validationHook), async (c) => {
      try {
        const params = c.req.valid("query");
        const queryParams: LogQueryParams = {
          level: splitLevels(params.level),
          service: splitStrings(params.service),
          host: splitStrings(params.host),
          source: splitStrings(params.source),
          search: params.search,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit,
          offset: params.offset,
          order: params.order,
          jsonFilters: parseJsonFilters(params.jsonFilters),
        };
        const result = await db.queryLogs(queryParams);
        return c.json({
          logs: result.logs.map(serializeLogEntry),
          total: result.total,
        });
      } catch (err) {
        return c.json(
          {
            error: {
              code: "QUERY_ERROR" as const,
              message: err instanceof Error ? err.message : "Unknown error",
            },
          },
          500,
        );
      }
    })

    // ----- GET /api/histogram -----
    .get("/histogram", zValidator("query", histogramQuerySchema, validationHook), async (c) => {
      try {
        const params = c.req.valid("query");
        const result = await db.getHistogram({
          buckets: params.buckets,
          startTime: params.startTime,
          endTime: params.endTime,
          level: splitLevels(params.level),
          service: splitStrings(params.service),
          host: splitStrings(params.host),
          source: splitStrings(params.source),
          search: params.search,
          jsonFilters: parseJsonFilters(params.jsonFilters),
        });
        return c.json(result);
      } catch (err) {
        return c.json(
          {
            error: {
              code: "QUERY_ERROR" as const,
              message: err instanceof Error ? err.message : "Unknown error",
            },
          },
          500,
        );
      }
    })

    // ----- POST /api/query -----
    .post("/query", zValidator("json", sqlQuerySchema, validationHook), async (c) => {
      try {
        const { sql } = c.req.valid("json");
        const result = await db.executeQuery(sql);
        return c.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        // Check if it's a forbidden SQL error from LogDatabase
        if (message.startsWith("Forbidden SQL:")) {
          return c.json(
            {
              error: {
                code: "FORBIDDEN_SQL" as const,
                message,
              },
            },
            403,
          );
        }
        return c.json(
          {
            error: {
              code: "QUERY_ERROR" as const,
              message,
            },
          },
          500,
        );
      }
    })

    // ----- POST /api/export -----
    .post("/export", zValidator("json", exportSchema, validationHook), async (c) => {
      try {
        const params = c.req.valid("json");
        const queryParams: LogQueryParams = {
          level: splitLevels(params.level),
          service: splitStrings(params.service),
          source: splitStrings(params.source),
          search: params.search,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: 10000, // Export up to max
          offset: 0,
          order: "desc",
        };

        const stream = await db.exportLogs(queryParams, params.format);

        const contentType =
          params.format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
        const ext = params.format === "csv" ? "csv" : "json";

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="logs-export.${ext}"`,
          },
        });
      } catch (err) {
        return c.json(
          {
            error: {
              code: "INTERNAL_ERROR" as const,
              message: err instanceof Error ? err.message : "Unknown error",
            },
          },
          500,
        );
      }
    })

    // ----- POST /api/ingest -----
    .post("/ingest", zValidator("json", ingestBodySchema, validationHook), (c) => {
      if (!ingester) {
        return c.json(
          {
            error: {
              code: "NOT_AVAILABLE" as const,
              message: "Ingestion not available",
            },
          },
          503,
        );
      }

      const body = c.req.valid("json");
      const items = Array.isArray(body) ? body : [body];
      const lines = items.map((item) => JSON.stringify(item));
      ingester.ingestLines(lines);

      return c.json({ accepted: lines.length });
    })

    // ----- GET /api/facets -----
    .get("/facets", zValidator("query", facetQuerySchema, validationHook), async (c) => {
      try {
        const params = c.req.valid("query");
        const filters: Partial<LogQueryParams> = {
          level: splitLevels(params.level),
          service: splitStrings(params.service),
          host: splitStrings(params.host),
          source: splitStrings(params.source),
          search: params.search,
          startTime: params.startTime,
          endTime: params.endTime,
          jsonFilters: parseJsonFilters(params.jsonFilters),
        };
        const distribution = await db.getFacetDistribution(
          params.field,
          params.jsonPath ?? null,
          filters,
        );
        return c.json(distribution);
      } catch (err) {
        return c.json(
          {
            error: {
              code: "QUERY_ERROR" as const,
              message: err instanceof Error ? err.message : "Unknown error",
            },
          },
          500,
        );
      }
    });

  return app;
}

export type AppType = ReturnType<typeof createApiApp>;

// Default export: a placeholder Hono app for the dev server (src/server/index.ts).
// The real API app is created via createApiApp(db) with a LogDatabase dependency.
// This placeholder will be replaced when the CLI entry point is implemented (task 6).
const placeholder = new Hono().basePath("/api").get("/health", (c) =>
  c.json({ status: "ok" as const, uptime: 0 }),
);
export default placeholder;
