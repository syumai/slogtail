import { useState, useEffect, useRef, useCallback } from "react";
import { hc } from "hono/client";
import type { AppType } from "../server/app";
import type { LogLevel } from "../types";
import type { FilterState } from "./store";

// ---------------------------------------------------------------------------
// RPC Client
// ---------------------------------------------------------------------------

export const client = hc<AppType>("/");

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export interface QueryFilters {
  search?: string;
  level?: LogLevel[];
  service?: string[];
  source?: string[];
  startTime?: Date;
  endTime?: Date;
  limit: number;
  offset: number;
  order: "asc" | "desc";
  jsonFilters?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Serialized types (what the API actually returns as JSON)
// ---------------------------------------------------------------------------

export interface SerializedLogEntry {
  _id: string;
  _ingested: string;
  _raw: Record<string, unknown>;
  timestamp: string | null;
  level: string | null;
  message: string | null;
  service: string | null;
  trace_id: string | null;
  host: string | null;
  duration_ms: number | null;
  source: string;
}

export interface SerializedLogStats {
  total: number;
  byLevel: Record<string, number>;
  errorRate: number;
  timeRange: { min: string | null; max: string | null };
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function joinArray(arr: string[] | undefined): string | undefined {
  return arr && arr.length > 0 ? arr.join(",") : undefined;
}

function serializeJsonFilters(filters: Record<string, string[]> | undefined): string | undefined {
  if (!filters || Object.keys(filters).length === 0) return undefined;
  return JSON.stringify(filters);
}

// ---------------------------------------------------------------------------
// useLogs - Fetch logs with filters
// ---------------------------------------------------------------------------

export interface UseLogsResult {
  logs: SerializedLogEntry[];
  total: number;
  isLoading: boolean;
  error: string | null;
  refetch(): void;
}

export function useLogs(filters: QueryFilters): UseLogsResult {
  const [logs, setLogs] = useState<SerializedLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const query = {
      limit: String(filters.limit),
      offset: String(filters.offset),
      order: filters.order,
      search: filters.search,
      level: joinArray(filters.level),
      service: joinArray(filters.service),
      source: joinArray(filters.source),
      startTime: filters.startTime?.toISOString(),
      endTime: filters.endTime?.toISOString(),
      jsonFilters: serializeJsonFilters(filters.jsonFilters),
    };

    client.api.logs
      .$get({ query })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // The response has logs and total fields
        const body = data as { logs: SerializedLogEntry[]; total: number };
        setLogs(body.logs);
        setTotal(body.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKey triggers refetch
  }, [
    filters.search,
    JSON.stringify(filters.level),
    JSON.stringify(filters.service),
    JSON.stringify(filters.source),
    filters.startTime?.getTime(),
    filters.endTime?.getTime(),
    filters.limit,
    filters.offset,
    filters.order,
    JSON.stringify(filters.jsonFilters),
    fetchKey,
  ]);

  return { logs, total, isLoading, error, refetch };
}

// ---------------------------------------------------------------------------
// useStats - Fetch log statistics
// ---------------------------------------------------------------------------

export interface UseStatsResult {
  stats: SerializedLogStats | null;
  isLoading: boolean;
  error: string | null;
  refetch(): void;
}

export function useStats(source?: string): UseStatsResult {
  const [stats, setStats] = useState<SerializedLogStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const query = { source };

    client.api.stats
      .$get({ query })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setStats(data as SerializedLogStats);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, fetchKey]);

  return { stats, isLoading, error, refetch };
}

// ---------------------------------------------------------------------------
// useFacets - Fetch facet value distribution
// ---------------------------------------------------------------------------

export interface FacetValue {
  value: string;
  count: number;
}

export interface UseFacetsResult {
  field: string;
  values: FacetValue[];
  isLoading: boolean;
  error: string | null;
  refetch(): void;
}

export function useFacets(
  field: string,
  jsonPath: string | null,
  filters: Partial<QueryFilters>,
  refetchIntervalMs?: number,
): UseFacetsResult {
  const [values, setValues] = useState<FacetValue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const hasLoadedRef = useRef(false);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    // Only show loading indicator on initial fetch to avoid flickering during periodic refetches
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    setError(null);

    const query = {
      field,
      jsonPath: jsonPath ?? undefined,
      level: joinArray(filters.level),
      service: joinArray(filters.service),
      source: joinArray(filters.source),
      search: filters.search,
      startTime: filters.startTime?.toISOString(),
      endTime: filters.endTime?.toISOString(),
      jsonFilters: serializeJsonFilters(filters.jsonFilters),
    };

    client.api.facets
      .$get({ query })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const body = data as { field: string; values: FacetValue[] };
        setValues(body.values);
        hasLoadedRef.current = true;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    field,
    jsonPath,
    JSON.stringify(filters.level),
    JSON.stringify(filters.service),
    JSON.stringify(filters.source),
    filters.search,
    filters.startTime?.getTime(),
    filters.endTime?.getTime(),
    JSON.stringify(filters.jsonFilters),
    fetchKey,
  ]);

  // Periodic refetch (e.g. during live tail)
  useEffect(() => {
    if (!refetchIntervalMs || refetchIntervalMs <= 0) return;
    const timer = setInterval(() => {
      setFetchKey((k) => k + 1);
    }, refetchIntervalMs);
    return () => clearInterval(timer);
  }, [refetchIntervalMs]);

  return { field, values, isLoading, error, refetch };
}

// ---------------------------------------------------------------------------
// useWebSocket - WebSocket connection management for live tail
// ---------------------------------------------------------------------------

export interface WSLogMessage {
  type: "logs";
  data: SerializedLogEntry[];
}

export interface WSStatsMessage {
  type: "stats";
  data: SerializedLogStats;
}

export type WSMessage = WSLogMessage | WSStatsMessage;

export interface UseWebSocketOptions {
  onLogs?(logs: SerializedLogEntry[]): void;
  onStats?(stats: SerializedLogStats): void;
  filter?: { level?: LogLevel[]; service?: string[]; source?: string[]; search?: string };
  enabled?: boolean;
}

export interface UseWebSocketResult {
  isConnected: boolean;
  reconnect(): void;
  disconnect(): void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const { onLogs, onStats, filter, enabled = true } = options;

  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store latest callbacks and filter in refs to avoid re-connecting on changes
  const onLogsRef = useRef(onLogs);
  onLogsRef.current = onLogs;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    cleanup();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws/tail`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Send initial filter if provided
      if (filterRef.current) {
        ws.send(JSON.stringify({ type: "filter", filter: filterRef.current }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSMessage;
        if (msg.type === "logs" && onLogsRef.current) {
          onLogsRef.current(msg.data);
        } else if (msg.type === "stats" && onStatsRef.current) {
          onStatsRef.current(msg.data);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Auto-reconnect after 2 seconds if still enabled
      if (enabled) {
        reconnectTimerRef.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, [cleanup, enabled]);

  // Connect/disconnect based on enabled flag
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      cleanup();
    }
    return cleanup;
  }, [enabled, connect, cleanup]);

  // Send updated filter when it changes and we're connected
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && filter) {
      wsRef.current.send(JSON.stringify({ type: "filter", filter }));
    }
  }, [filter]);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  return { isConnected, reconnect, disconnect };
}

// ---------------------------------------------------------------------------
// exportLogs - Trigger file download via export API
// ---------------------------------------------------------------------------

export async function exportLogs(
  format: "csv" | "json",
  filters: Partial<FilterState>,
): Promise<void> {
  const res = await client.api.export.$post({
    json: {
      format,
      level: filters.level && filters.level.length > 0 ? filters.level.join(",") : undefined,
      service: filters.service && filters.service.length > 0 ? filters.service.join(",") : undefined,
      source: filters.source && filters.source.length > 0 ? filters.source.join(",") : undefined,
      search: filters.search,
      startTime: filters.startTime,
      endTime: filters.endTime,
    },
  });

  if (!res.ok) {
    throw new Error(`Export failed: HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const ext = format === "csv" ? "csv" : "json";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `logs-export.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
