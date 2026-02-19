import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLogs, useWebSocket } from "../api";
import type { SerializedLogEntry } from "../api";
import { useFilters } from "../store";
import { LogRow } from "./LogRow";
import { Pagination } from "./Pagination";

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
  backgroundColor: "#16162a",
  borderBottom: "1px solid #2a2a4a",
  fontSize: "13px",
};

const toolbarLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const sortButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  backgroundColor: "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#c0c0e0",
  cursor: "pointer",
  fontSize: "12px",
};

const liveTailButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "4px 12px",
  backgroundColor: active ? "#1a4a1a" : "#2a2a4a",
  border: `1px solid ${active ? "#2a7a2a" : "#3a3a5a"}`,
  borderRadius: "4px",
  color: active ? "#44cc44" : "#c0c0e0",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: active ? "bold" : "normal",
});

const connectedDotStyle = (connected: boolean): React.CSSProperties => ({
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  backgroundColor: connected ? "#44cc44" : "#666",
  marginRight: "4px",
});

const listStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  backgroundColor: "#0f0f23",
};

const headerRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "160px 60px 1fr 100px",
  gap: "8px",
  padding: "6px 16px",
  backgroundColor: "#1a1a2e",
  borderBottom: "1px solid #2a2a4a",
  fontSize: "12px",
  fontWeight: "bold",
  color: "#6a6a9a",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 16px",
  color: "#555",
  fontSize: "14px",
};

const errorStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  color: "#ff4444",
  fontSize: "14px",
};

const loadingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  color: "#a0a0c0",
  fontSize: "14px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_LIVE_LOGS = 500;

export function LogViewer() {
  const [filters, actions] = useFilters();
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch logs via REST API (used when live tail is off)
  const queryFilters = useMemo(
    () => ({
      search: filters.search,
      level: filters.level,
      service: filters.service,
      source: filters.source,
      startTime: filters.startTime,
      endTime: filters.endTime,
      limit: filters.limit,
      offset: filters.offset,
      order: filters.order,
    }),
    [
      filters.search,
      filters.level,
      filters.service,
      filters.source,
      filters.startTime,
      filters.endTime,
      filters.limit,
      filters.offset,
      filters.order,
    ],
  );

  const { logs: apiLogs, total, isLoading, error } = useLogs(queryFilters);

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
      level: filters.level,
      service: filters.service,
      source: filters.source,
    }),
    [filters.level, filters.service, filters.source],
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

  // Auto-scroll to top on new live logs
  useEffect(() => {
    if (filters.isLiveTail && liveLogs.length > 0 && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [filters.isLiveTail, liveLogs.length]);

  const handleSortToggle = useCallback(() => {
    actions.setOrder(filters.order === "desc" ? "asc" : "desc");
  }, [filters.order, actions]);

  const handleLiveTailToggle = useCallback(() => {
    actions.toggleLiveTail();
  }, [actions]);

  const displayLogs = filters.isLiveTail ? liveLogs : apiLogs;

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
            <span style={{ color: "#6a6a9a" }}>
              {total.toLocaleString()} results
            </span>
          )}
          {filters.isLiveTail && (
            <span style={{ color: "#6a6a9a" }}>
              {liveLogs.length} live logs
            </span>
          )}
        </div>
        <div style={toolbarLeftStyle}>
          {filters.isLiveTail && (
            <span>
              <span style={connectedDotStyle(isConnected)} />
              <span style={{ color: "#6a6a9a", fontSize: "12px" }}>
                {isConnected ? "Connected" : "Disconnected"}
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
          <LogRow key={log._id} log={log} />
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
    </div>
  );
}
