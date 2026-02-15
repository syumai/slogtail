import type { Ingester } from "./ingester";
import type { LogDatabase } from "./db";
import type {
  NormalizedLog,
  LogStats,
  WSFilter,
} from "../types";

// ---------------------------------------------------------------------------
// Filter matching (pure function, exported for testing)
// ---------------------------------------------------------------------------

/**
 * Check whether a log entry matches the given filter criteria.
 * All present filter fields must match (AND logic).
 * Empty/undefined filter matches everything.
 */
export function matchesFilter(log: NormalizedLog, filter: WSFilter): boolean {
  if (filter.level !== undefined && log.level !== filter.level) {
    return false;
  }
  if (filter.service !== undefined && log.service !== filter.service) {
    return false;
  }
  if (filter.source !== undefined && log.source !== filter.source) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Log serialization (NormalizedLog -> LogEntry-like JSON-safe object)
// ---------------------------------------------------------------------------

function serializeLog(log: NormalizedLog) {
  let rawParsed: Record<string, unknown>;
  try {
    rawParsed = JSON.parse(log._raw);
  } catch {
    rawParsed = {};
  }

  return {
    _id: String(log._id),
    _ingested: log._ingested.toISOString(),
    _raw: rawParsed,
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

function serializeStats(stats: LogStats) {
  return {
    total: stats.total,
    byLevel: stats.byLevel,
    errorRate: stats.errorRate,
    timeRange: {
      min: stats.timeRange.min?.toISOString() ?? null,
      max: stats.timeRange.max?.toISOString() ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// WSHandler class
// ---------------------------------------------------------------------------

/** Minimal interface for objects that behave like WSContext */
interface WSLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}

/**
 * Manages WebSocket client connections and their per-client filters.
 * Subscribes to Ingester "batch" events and broadcasts filtered logs
 * and stats to connected clients.
 */
export class WSHandler {
  private clients: Map<WSLike, WSFilter> = new Map();
  private db: LogDatabase | null = null;

  /** Number of currently connected clients */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Set the LogDatabase reference for stats retrieval during broadcast.
   */
  setDatabase(db: LogDatabase): void {
    this.db = db;
  }

  /**
   * Subscribe to an Ingester's "batch" event.
   * When a batch is ingested, broadcasts matching logs to clients.
   */
  subscribe(ingester: Ingester): void {
    ingester.on("batch", async (logs: ReadonlyArray<NormalizedLog>) => {
      let stats: LogStats | null = null;
      if (this.db) {
        try {
          stats = await this.db.getStats();
        } catch {
          // If stats retrieval fails, send logs without stats
        }
      }
      if (stats) {
        this.broadcast([...logs], stats);
      }
    });
  }

  /**
   * Handle a new WebSocket connection.
   * Registers the client with an empty (match-all) filter.
   */
  handleConnection(ws: WSLike): void {
    this.clients.set(ws, {});
  }

  /**
   * Handle a message from a WebSocket client.
   * Expects JSON messages of type WSClientMessage.
   * Invalid messages are silently ignored.
   */
  handleMessage(ws: WSLike, message: string): void {
    // Ignore messages from unregistered clients
    if (!this.clients.has(ws)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      // Invalid JSON - ignore
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return;
    }

    const msg = parsed as Record<string, unknown>;

    if (msg.type !== "filter") {
      return;
    }

    if (typeof msg.filter !== "object" || msg.filter === null || Array.isArray(msg.filter)) {
      return;
    }

    const filterObj = msg.filter as Record<string, unknown>;
    const filter: WSFilter = {};

    if (typeof filterObj.level === "string") {
      filter.level = filterObj.level as WSFilter["level"];
    }
    if (typeof filterObj.service === "string") {
      filter.service = filterObj.service;
    }
    if (typeof filterObj.source === "string") {
      filter.source = filterObj.source;
    }

    this.clients.set(ws, filter);
  }

  /**
   * Handle WebSocket connection close.
   * Removes the client from the registry.
   */
  handleClose(ws: WSLike): void {
    this.clients.delete(ws);
  }

  /**
   * Get the current filter for a client.
   * Returns undefined if the client is not registered.
   */
  getClientFilter(ws: WSLike): WSFilter | undefined {
    return this.clients.get(ws);
  }

  /**
   * Broadcast new logs and stats to all connected clients.
   * Logs are filtered per-client based on their active filter.
   * Stats are always sent to all clients.
   * If no logs match a client's filter, only stats are sent.
   */
  broadcast(logs: ReadonlyArray<NormalizedLog>, stats: LogStats): void {
    const serializedStats = JSON.stringify({
      type: "stats" as const,
      data: serializeStats(stats),
    });

    for (const [ws, filter] of this.clients) {
      // Skip clients that are not in OPEN state
      if (ws.readyState !== 1) continue;

      // Filter logs for this client
      const matched = logs.filter((log) => matchesFilter(log, filter));

      // Send logs only if there are matching entries
      if (matched.length > 0) {
        const logsMessage = JSON.stringify({
          type: "logs" as const,
          data: matched.map(serializeLog),
        });
        ws.send(logsMessage);
      }

      // Always send stats
      ws.send(serializedStats);
    }
  }
}
