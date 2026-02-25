import { memo, useCallback } from "react";
import type { SerializedLogEntry } from "../api";

// ---------------------------------------------------------------------------
// Level colors
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<string, string> = {
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

const rowStyle = (isSelected: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "160px 60px 1fr 100px",
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogRowProps {
  log: SerializedLogEntry;
  isSelected: boolean;
  onSelect: (logId: string) => void;
}

export const LogRow = memo(function LogRow({
  log,
  isSelected,
  onSelect,
}: LogRowProps) {
  const handleClick = useCallback(() => {
    onSelect(log._id);
  }, [onSelect, log._id]);

  const ts = log.timestamp
    ? new Date(log.timestamp).toISOString().replace("T", " ").slice(0, 23)
    : "--";

  const sColor = sourceColor(log.source);

  return (
    <div
      style={rowStyle(isSelected)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
    >
      <span style={timestampStyle}>{ts}</span>
      <span style={levelStyle(log.level)}>{log.level ?? "-"}</span>
      <span style={messageStyle}>{log.message ?? ""}</span>
      <span style={sourceTagStyle(sColor)}>{log.source}</span>
    </div>
  );
});
