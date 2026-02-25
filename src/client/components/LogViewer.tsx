import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLogs, useWebSocket } from "../api";
import type { SerializedLogEntry } from "../api";
import { useFilters } from "../store";
import type { LogLevel } from "../../types";
import { LogRow } from "./LogRow";
import { LogDetailPanel } from "./LogDetailPanel";
import { Pagination } from "./Pagination";
import { useKeyboardNav } from "./useKeyboardNav";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 16px",
  backgroundColor: "#fafafa",
  borderBottom: "1px solid #e0e0e0",
  fontSize: "13px",
};

const toolbarLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const sortButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  backgroundColor: "#f5f5f5",
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  color: "#333333",
  cursor: "pointer",
  fontSize: "12px",
};

const liveTailButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "4px 12px",
  backgroundColor: active ? "#dcfce7" : "#f5f5f5",
  border: `1px solid ${active ? "#22c55e" : "#d0d0d0"}`,
  borderRadius: "4px",
  color: active ? "#16a34a" : "#333333",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: active ? "bold" : "normal",
});

const connectedDotStyle = (connected: boolean): React.CSSProperties => ({
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  backgroundColor: connected ? "#22c55e" : "#999",
  marginRight: "4px",
});

const listStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  backgroundColor: "#ffffff",
};

const headerRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "160px 60px 1fr 100px",
  gap: "8px",
  padding: "6px 16px",
  backgroundColor: "#f5f5f5",
  borderBottom: "1px solid #e0e0e0",
  fontSize: "12px",
  fontWeight: "bold",
  color: "#999999",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 16px",
  color: "#999999",
  fontSize: "14px",
};

const errorStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  color: "#dc2626",
  fontSize: "14px",
};

const loadingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  color: "#666666",
  fontSize: "14px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_LIVE_LOGS = 500;

interface LogViewerProps {
  /** Ref to the search input element, used by keyboard navigation (/ key). */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function LogViewer({ searchInputRef }: LogViewerProps = {}) {
  const [filters, actions] = useFilters();
  const listRef = useRef<HTMLDivElement>(null);
  const fallbackSearchInputRef = useRef<HTMLInputElement | null>(null);
  const effectiveSearchInputRef = searchInputRef ?? fallbackSearchInputRef;

  // Fetch logs via REST API (used when live tail is off)
  const queryFilters = useMemo(
    () => ({
      search: filters.search,
      level: filters.level.length > 0 ? filters.level : undefined,
      service: filters.service.length > 0 ? filters.service : undefined,
      host: filters.host.length > 0 ? filters.host : undefined,
      source: filters.source.length > 0 ? filters.source : undefined,
      startTime: filters.startTime,
      endTime: filters.endTime,
      limit: filters.limit,
      offset: filters.offset,
      order: filters.order,
      jsonFilters: Object.keys(filters.jsonFilters).length > 0 ? filters.jsonFilters : undefined,
    }),
    [
      filters.search,
      filters.level,
      filters.service,
      filters.host,
      filters.source,
      filters.startTime,
      filters.endTime,
      filters.limit,
      filters.offset,
      filters.order,
      filters.jsonFilters,
    ],
  );

  const { logs: apiLogs, total, isLoading, error, refetch } = useLogs(queryFilters);

  // Live tail state
  const [liveLogs, setLiveLogs] = useState<SerializedLogEntry[]>([]);

  const handleLiveLogs = useCallback((newLogs: SerializedLogEntry[]) => {
    setLiveLogs((prev) => {
      const merged = [...newLogs, ...prev];
      return merged.slice(0, MAX_LIVE_LOGS);
    });
  }, []);

  const wsFilter = useMemo(
    () => ({
      level: filters.level.length > 0 ? filters.level : undefined,
      service: filters.service.length > 0 ? filters.service : undefined,
      host: filters.host.length > 0 ? filters.host : undefined,
      source: filters.source.length > 0 ? filters.source : undefined,
      search: filters.search,
    }),
    [filters.level, filters.service, filters.host, filters.source, filters.search],
  );

  const { isConnected } = useWebSocket({
    onLogs: handleLiveLogs,
    filter: wsFilter,
    enabled: filters.isLiveTail,
  });

  // Clear live logs when live tail is toggled off
  useEffect(() => {
    if (!filters.isLiveTail) {
      setLiveLogs([]);
    }
  }, [filters.isLiveTail]);

  // Polling fallback: when live tail is on but WebSocket is unavailable (e.g. Vite dev server),
  // periodically refetch logs via REST API
  useEffect(() => {
    if (!filters.isLiveTail || isConnected) return;

    refetch();

    const interval = setInterval(() => {
      refetch();
    }, 1000);

    return () => clearInterval(interval);
  }, [filters.isLiveTail, isConnected, refetch]);

  const handleSortToggle = useCallback(() => {
    actions.setOrder(filters.order === "desc" ? "asc" : "desc");
  }, [filters.order, actions]);

  const handleLiveTailToggle = useCallback(() => {
    actions.toggleLiveTail();
  }, [actions]);

  // When live tail is on: use WebSocket logs if connected, otherwise use polled API logs.
  // Apply client-side filtering for live tail logs to ensure all active filters are respected.
  const displayLogs = useMemo(() => {
    const baseLogs = filters.isLiveTail
      ? (isConnected ? liveLogs : apiLogs)
      : apiLogs;

    if (!filters.isLiveTail || !isConnected) return baseLogs;

    return baseLogs.filter((log) => {
      if (filters.level.length > 0 && !filters.level.includes(log.level as LogLevel)) return false;
      if (filters.service.length > 0 && !filters.service.includes(log.service ?? "")) return false;
      if (filters.host.length > 0 && !filters.host.includes(log.host ?? "")) return false;
      if (filters.source.length > 0 && !filters.source.includes(log.source)) return false;
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        if (!log.message?.toLowerCase().includes(needle)) return false;
      }
      // Custom JSON facet filters
      for (const [jsonPath, expectedValues] of Object.entries(filters.jsonFilters)) {
        const raw = log._raw;
        if (typeof raw !== "object" || raw === null) return false;
        const segments = jsonPath.split(".");
        let current: unknown = raw;
        for (const seg of segments) {
          if (typeof current !== "object" || current === null) {
            current = undefined;
            break;
          }
          current = (current as Record<string, unknown>)[seg];
        }
        if (!expectedValues.includes(String(current))) return false;
      }
      return true;
    });
  }, [filters.isLiveTail, isConnected, liveLogs, apiLogs, filters.level, filters.service, filters.host, filters.source, filters.search, filters.jsonFilters]);

  // -------------------------------------------------------------------------
  // Selection state: track by log id, derive selected index from displayLogs
  // -------------------------------------------------------------------------
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const selectedIndex = useMemo(() => {
    if (selectedLogId === null) return -1;
    return displayLogs.findIndex((l) => l._id === selectedLogId);
  }, [selectedLogId, displayLogs]);

  // Auto-scroll to top on new live logs, unless detail panel is open.
  useEffect(() => {
    if (filters.isLiveTail && selectedLogId === null && liveLogs.length > 0 && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [filters.isLiveTail, liveLogs.length, selectedLogId]);

  // When a row is clicked, toggle selection
  const handleLogSelect = useCallback(
    (logId: string) => {
      setSelectedLogId((prev) => (prev === logId ? null : logId));
    },
    [],
  );

  const handleDetailClose = useCallback(() => {
    setSelectedLogId(null);
  }, []);

  const handleTraceIdClick = useCallback(
    (traceId: string) => {
      actions.setSearch(`trace_id:${traceId}`);
    },
    [actions],
  );

  // Open detail panel for the currently selected index.
  // onOpenDetail is called by useKeyboardNav when Enter is pressed.
  // The detail panel is shown when selectedLogId is not null (derived from selectedIndex).
  // No extra action needed here -- the index is already set.
  const handleOpenDetail = useCallback(() => {}, []);

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------
  useKeyboardNav({
    totalItems: displayLogs.length,
    selectedIndex,
    isDetailOpen: selectedLogId !== null,
    onSelectIndex: (index) => {
      if (index < 0 || index >= displayLogs.length) {
        setSelectedLogId(null);
        return;
      }
      setSelectedLogId(displayLogs[index]?._id ?? null);
    },
    onOpenDetail: handleOpenDetail,
    onCloseDetail: handleDetailClose,
    searchInputRef: effectiveSearchInputRef,
  });

  // Scroll selected row into view
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const rows = listRef.current.querySelectorAll("[role='button']");
    const target = rows[selectedIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Reset selection when selected log is no longer visible in the current display set
  useEffect(() => {
    if (selectedLogId === null) return;
    if (displayLogs.some((l) => l._id === selectedLogId)) return;
    setSelectedLogId(null);
  }, [displayLogs, selectedLogId]);

  const selectedLog = useMemo(
    () => (selectedLogId ? displayLogs.find((l) => l._id === selectedLogId) ?? null : null),
    [selectedLogId, displayLogs],
  );

  return (
    <div style={containerStyle}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <div style={toolbarLeftStyle}>
          <button style={sortButtonStyle} onClick={handleSortToggle}>
            Sort: {filters.order === "desc" ? "Newest first" : "Oldest first"}{" "}
            {filters.order === "desc" ? "\u2193" : "\u2191"}
          </button>
          {!filters.isLiveTail && (
            <span style={{ color: "#999999" }}>
              {total.toLocaleString()} results
            </span>
          )}
          {filters.isLiveTail && (
            <span style={{ color: "#999999" }}>
              {isConnected ? `${liveLogs.length} live logs` : `${total.toLocaleString()} results (polling)`}
            </span>
          )}
        </div>
        <div style={toolbarLeftStyle}>
          {filters.isLiveTail && (
            <span>
              <span style={connectedDotStyle(isConnected)} />
              <span style={{ color: "#999999", fontSize: "12px" }}>
                {isConnected ? "Connected" : "Polling"}
              </span>
            </span>
          )}
          <button
            style={liveTailButtonStyle(filters.isLiveTail)}
            onClick={handleLiveTailToggle}
          >
            {filters.isLiveTail ? "Live Tail ON" : "Live Tail OFF"}
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div style={headerRowStyle}>
        <span>Timestamp</span>
        <span style={{ textAlign: "center" }}>Level</span>
        <span>Message</span>
        <span style={{ textAlign: "right" }}>Source</span>
      </div>

      {/* Log list */}
      <div style={listStyle} ref={listRef}>
        {error && <div style={errorStyle}>Error: {error}</div>}
        {isLoading && !filters.isLiveTail && displayLogs.length === 0 && (
          <div style={loadingStyle}>Loading...</div>
        )}
        {!isLoading && !error && displayLogs.length === 0 && (
          <div style={emptyStyle}>No logs found</div>
        )}
        {displayLogs.map((log) => (
          <LogRow
            key={log._id}
            log={log}
            isSelected={log._id === selectedLogId}
            onSelect={handleLogSelect}
          />
        ))}
      </div>

      {/* Pagination (only when not in live tail mode) */}
      {!filters.isLiveTail && total > 0 && (
        <Pagination
          offset={filters.offset}
          limit={filters.limit}
          total={total}
          onOffsetChange={actions.setOffset}
        />
      )}

      {/* Detail slide-over panel */}
      <LogDetailPanel log={selectedLog} onClose={handleDetailClose} onTraceIdClick={handleTraceIdClick} />
    </div>
  );
}
