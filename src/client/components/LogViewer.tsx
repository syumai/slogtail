import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLogs, useWebSocket } from "../api";
import type { SerializedLogEntry, UseWebSocketOptions } from "../api";
import { useFilters } from "../store";
import { LogRow } from "./LogRow";
import { LogDetailPanel } from "./LogDetailPanel";
import { Pagination } from "./Pagination";
import { useKeyboardNav } from "./useKeyboardNav";
import { useColumnConfig, type ColumnDefinition } from "./useColumnConfig";
import { ColumnSettingsPanel } from "./ColumnSettingsPanel";

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

const toolbarRightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
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

const iconButtonStyle: React.CSSProperties = {
  ...sortButtonStyle,
  minWidth: "34px",
  padding: "4px 8px",
};

const settingsWrapStyle: React.CSSProperties = {
  position: "relative",
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

const headerRowStyle = (gridTemplateColumns: string): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns,
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
});

const headerCellStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const getHeaderResizeHandleStyle = (isHovered: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  right: 0,
  width: "4px",
  height: "100%",
  cursor: "col-resize",
  userSelect: "none",
  backgroundColor: isHovered ? "rgba(255, 255, 255, 0.3)" : "transparent",
  borderRight: isHovered ? "1px solid rgba(255, 255, 255, 0.5)" : "none",
});

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
// Exported pure functions (testable without React rendering)
// ---------------------------------------------------------------------------

/**
 * Task 5.1: Returns apiLogs directly without any client-side filtering, merging, or dedup.
 * All filtering is handled server-side by DuckDB.
 */
export function resolveDisplayLogs(apiLogs: SerializedLogEntry[]): SerializedLogEntry[] {
  return apiLogs;
}

/**
 * Task 5.2: Build UseWebSocketOptions connecting onNotify to refetch.
 * No onLogs, filter, or onStats properties are included.
 */
export function resolveWebSocketOptions(
  refetch: () => void,
  enabled: boolean,
): UseWebSocketOptions {
  return {
    onNotify: refetch,
    enabled,
  };
}

/**
 * Task 5.3: Resolve toolbar status text.
 * Always shows total results count from the server (no client-side liveLogs count).
 */
export function resolveToolbarStatus(params: {
  isLiveTail: boolean;
  isConnected: boolean;
  total: number;
}): string {
  const { total } = params;
  return `${total.toLocaleString()} results`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogViewerProps {
  /** Ref to the search input element, used by keyboard navigation (/ key). */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

interface SortState {
  column: string | null;
  direction: "asc" | "desc";
}

function resolveJsonPathValue(data: unknown, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return undefined;

  let current: unknown = data;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveColumnValue(log: SerializedLogEntry, column: ColumnDefinition): unknown {
  if (column.jsonPath) {
    return resolveJsonPathValue(log._raw, column.jsonPath);
  }
  const key = column.field as keyof SerializedLogEntry;
  if (!(key in log)) return undefined;
  return log[key];
}

function toComparable(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && value.trim() !== "") {
      return asNumber;
    }
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) {
      return asDate;
    }
    return value.toLowerCase();
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return JSON.stringify(value);
}

function compareValues(left: number | string | null, right: number | string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function nextSortState(prev: SortState, columnId: string): SortState {
  if (prev.column !== columnId) {
    return { column: columnId, direction: "asc" };
  }
  if (prev.direction === "asc") {
    return { column: columnId, direction: "desc" };
  }
  return { column: null, direction: "asc" };
}

export function LogViewer({ searchInputRef }: LogViewerProps = {}) {
  const [filters, actions] = useFilters();
  const {
    columns,
    allColumns,
    gridTemplateColumns,
    setColumnWidth,
    toggleColumnVisibility,
    addColumn,
    removeColumn,
    resetToDefault,
  } = useColumnConfig();
  const listRef = useRef<HTMLDivElement>(null);
  const fallbackSearchInputRef = useRef<HTMLInputElement | null>(null);
  const effectiveSearchInputRef = searchInputRef ?? fallbackSearchInputRef;
  const [sortState, setSortState] = useState<SortState>({
    column: "timestamp",
    direction: "desc",
  });
  const [isColumnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [hoveredResizeColumnId, setHoveredResizeColumnId] = useState<string | null>(null);

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

  // Task 5.2: Connect WebSocket onNotify to useLogs refetch
  const wsOptions = useMemo(
    () => resolveWebSocketOptions(refetch, filters.isLiveTail),
    [refetch, filters.isLiveTail],
  );
  const { isConnected } = useWebSocket(wsOptions);

  const handleLiveTailToggle = useCallback(() => {
    actions.toggleLiveTail();
  }, [actions]);

  const handleHeaderSortToggle = useCallback((columnId: string) => {
    setSortState((prev) => nextSortState(prev, columnId));
  }, []);

  const handleColumnResizeMouseDown = useCallback(
    (columnId: string, currentWidth: number, minWidth: number, event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const headerCell = event.currentTarget.parentElement;
      const measuredWidth = headerCell?.getBoundingClientRect().width ?? minWidth;
      const startWidth = currentWidth > 0 ? currentWidth : Math.max(measuredWidth, minWidth);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        setColumnWidth(columnId, startWidth + delta);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [setColumnWidth],
  );

  // Task 5.1: Use REST API response as sole data source (no client-side filtering)
  const displayLogs = resolveDisplayLogs(apiLogs);

  const sortedLogs = useMemo(() => {
    if (!sortState.column) return displayLogs;
    const sortColumn = columns.find((column) => column.id === sortState.column);
    if (!sortColumn) return displayLogs;

    const direction = sortState.direction === "asc" ? 1 : -1;
    return [...displayLogs]
      .map((log, index) => ({ log, index }))
      .sort((left, right) => {
        const leftValue = toComparable(resolveColumnValue(left.log, sortColumn));
        const rightValue = toComparable(resolveColumnValue(right.log, sortColumn));
        const compared = compareValues(leftValue, rightValue) * direction;
        if (compared !== 0) return compared;
        return left.index - right.index;
      })
      .map((entry) => entry.log);
  }, [columns, displayLogs, sortState.column, sortState.direction]);

  // -------------------------------------------------------------------------
  // Selection state: track by log id, derive selected index from displayLogs
  // -------------------------------------------------------------------------
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<SerializedLogEntry | null>(null);

  const selectedIndex = useMemo(() => {
    if (selectedLogId === null) return -1;
    return sortedLogs.findIndex((l) => l._id === selectedLogId);
  }, [selectedLogId, sortedLogs]);

  // Auto-scroll to top on new logs during live tail, unless detail panel is open.
  // Only scroll when user is near top or when Live Tail is just toggled on.
  const prevIsLiveTailRef = useRef(filters.isLiveTail);

  useEffect(() => {
    const justEnabled = !prevIsLiveTailRef.current && filters.isLiveTail;
    prevIsLiveTailRef.current = filters.isLiveTail;

    if (!filters.isLiveTail || selectedLogId !== null || !listRef.current) return;

    if (justEnabled || listRef.current.scrollTop < 50) {
      listRef.current.scrollTop = 0;
    }
  }, [filters.isLiveTail, apiLogs, selectedLogId]);

  // When a row is clicked, toggle selection
  const handleLogSelect = useCallback(
    (log: SerializedLogEntry) => {
      setSelectedLogId((prev) => {
        const isSameLog = prev === log._id;
        setSelectedLog(isSameLog ? null : log);
        return isSameLog ? null : log._id;
      });
    },
    [],
  );

  const handleDetailClose = useCallback(() => {
    setSelectedLogId(null);
    setSelectedLog(null);
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
    totalItems: sortedLogs.length,
    selectedIndex,
    isDetailOpen: selectedLogId !== null,
    onSelectIndex: (index) => {
      if (index < 0 || index >= sortedLogs.length) {
        setSelectedLogId(null);
        setSelectedLog(null);
        return;
      }
      const nextLog = sortedLogs[index] ?? null;
      setSelectedLogId(nextLog?._id ?? null);
      setSelectedLog(nextLog);
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

  // Keep selected log content updated while preserving the panel when the row drops out of view.
  useEffect(() => {
    if (selectedLogId === null) return;
    const latestSelectedLog = sortedLogs.find((l) => l._id === selectedLogId);
    if (!latestSelectedLog) return;
    setSelectedLog(latestSelectedLog);
  }, [sortedLogs, selectedLogId]);

  return (
    <div style={containerStyle}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <div style={toolbarLeftStyle}>
          <span style={{ color: "#999999" }}>
            {resolveToolbarStatus({ isLiveTail: filters.isLiveTail, isConnected, total })}
          </span>
          {sortState.column && (
            <span style={{ color: "#666666" }}>
              Sorted by {columns.find((column) => column.id === sortState.column)?.label ?? sortState.column}{" "}
              {sortState.direction === "asc" ? "\u2191" : "\u2193"}
            </span>
          )}
        </div>
        <div style={toolbarRightStyle}>
          <div style={settingsWrapStyle}>
            <button
              type="button"
              style={iconButtonStyle}
              onClick={() => setColumnSettingsOpen((prev) => !prev)}
              title="Column settings"
            >
              {"\u2699"}
            </button>
            <ColumnSettingsPanel
              isOpen={isColumnSettingsOpen}
              columns={allColumns}
              onClose={() => setColumnSettingsOpen(false)}
              onToggleColumnVisibility={toggleColumnVisibility}
              onAddColumn={addColumn}
              onRemoveColumn={removeColumn}
              onResetToDefault={resetToDefault}
            />
          </div>
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
      <div style={headerRowStyle(gridTemplateColumns)}>
        {columns.map((column) => (
          <div
            key={column.id}
            style={{
              ...headerCellStyle,
              textAlign:
                column.field === "level" && column.jsonPath === null
                  ? "center"
                  : column.field === "source" && column.jsonPath === null
                    ? "right"
                    : "left",
            }}
            onClick={() => handleHeaderSortToggle(column.id)}
            title="Click to sort (asc / desc / none)"
          >
            <span>
              {column.label}
              {sortState.column === column.id && (sortState.direction === "asc" ? " \u25b2" : " \u25bc")}
            </span>
            <div
              role="separator"
              style={getHeaderResizeHandleStyle(hoveredResizeColumnId === column.id)}
              onMouseEnter={() => setHoveredResizeColumnId(column.id)}
              onMouseLeave={() => setHoveredResizeColumnId(null)}
              onMouseDown={(event) =>
                handleColumnResizeMouseDown(column.id, column.width, column.minWidth, event)
              }
            />
          </div>
        ))}
      </div>

      {/* Log list */}
      <div style={listStyle} ref={listRef}>
        {error && <div style={errorStyle}>Error: {error}</div>}
        {isLoading && displayLogs.length === 0 && (
          <div style={loadingStyle}>Loading...</div>
        )}
        {!isLoading && !error && sortedLogs.length === 0 && (
          <div style={emptyStyle}>No logs found</div>
        )}
        {sortedLogs.map((log) => (
          <LogRow
            key={log._id}
            log={log}
            columns={columns}
            gridTemplateColumns={gridTemplateColumns}
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
