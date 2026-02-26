import { memo, useCallback } from "react";
import type { SerializedLogEntry } from "../api";
import { formatLocalDateTime } from "../formatTime";
import type { ColumnDefinition } from "./useColumnConfig";

// ---------------------------------------------------------------------------
// Level colors
// ---------------------------------------------------------------------------

export const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "#6b7280",
  INFO: "#2563eb",
  WARN: "#d97706",
  ERROR: "#dc2626",
  FATAL: "#9333ea",
};

// ---------------------------------------------------------------------------
// Source colors - rotate through a palette for different sources
// ---------------------------------------------------------------------------

const SOURCE_PALETTE = [
  "#2563eb",
  "#059669",
  "#b45309",
  "#9333ea",
  "#0891b2",
  "#ca8a04",
  "#e11d48",
  "#6366f1",
];

function sourceColor(source: string): string {
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  }
  return SOURCE_PALETTE[Math.abs(hash) % SOURCE_PALETTE.length]!;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rowStyle = (
  isSelected: boolean,
  gridTemplateColumns: string,
): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns,
  gap: "8px",
  padding: "6px 16px",
  cursor: "pointer",
  backgroundColor: isSelected ? "#e8f0fe" : "transparent",
  borderBottom: "1px solid #f0f0f0",
  borderLeft: isSelected ? "3px solid #1a73e8" : "3px solid transparent",
  alignItems: "center",
  fontSize: "13px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  transition: "background-color 0.1s ease",
});

const timestampStyle: React.CSSProperties = {
  color: "#666666",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const levelStyle = (level: string | null): React.CSSProperties => ({
  color: LEVEL_COLORS[level ?? ""] ?? "#888",
  fontWeight: "bold",
  fontSize: "12px",
  textAlign: "center",
});

const messageStyle: React.CSSProperties = {
  color: "#333333",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sourceTagStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: "3px",
  backgroundColor: color + "18",
  color: color,
  fontSize: "11px",
  textAlign: "right",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const genericCellStyle: React.CSSProperties = {
  color: "#333333",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

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

function formatTimestamp(value: string | null): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatLocalDateTime(date);
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getCellValue(log: SerializedLogEntry, column: ColumnDefinition): string {
  if (column.jsonPath) {
    return formatCellValue(resolveJsonPathValue(log._raw, column.jsonPath));
  }

  if (column.field === "timestamp") {
    return formatTimestamp(log.timestamp);
  }

  const key = column.field as keyof SerializedLogEntry;
  if (key in log) {
    return formatCellValue(log[key]);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogRowProps {
  log: SerializedLogEntry;
  columns: ColumnDefinition[];
  gridTemplateColumns: string;
  isSelected: boolean;
  onSelect: (log: SerializedLogEntry) => void;
}

export const LogRow = memo(function LogRow({
  log,
  columns,
  gridTemplateColumns,
  isSelected,
  onSelect,
}: LogRowProps) {
  const handleClick = useCallback(() => {
    onSelect(log);
  }, [onSelect, log]);

  const sColor = sourceColor(log.source);

  return (
    <div
      style={rowStyle(isSelected, gridTemplateColumns)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
      {columns.map((column) => {
        const value = getCellValue(log, column);
        if (column.field === "timestamp" && column.jsonPath === null) {
          return (
            <span key={column.id} style={timestampStyle}>
              {value}
            </span>
          );
        }
        if (column.field === "level" && column.jsonPath === null) {
          const normalizedLevel = value.toUpperCase();
          return (
            <span key={column.id} style={levelStyle(normalizedLevel)}>
              {normalizedLevel || "-"}
            </span>
          );
        }
        if (column.field === "message" && column.jsonPath === null) {
          return (
            <span key={column.id} style={messageStyle}>
              {value}
            </span>
          );
        }
        if (column.field === "source" && column.jsonPath === null) {
          return (
            <span key={column.id} style={sourceTagStyle(sColor)}>
              {value}
            </span>
          );
        }
        return (
          <span key={column.id} style={genericCellStyle}>
            {value}
          </span>
        );
      })}
    </div>
  );
});
