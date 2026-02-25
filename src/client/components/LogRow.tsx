import { memo, useCallback } from "react";
import type { SerializedLogEntry } from "../api";

// ---------------------------------------------------------------------------
// Level colors
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "#888888",
  INFO: "#4a9eff",
  WARN: "#ffcc00",
  ERROR: "#ff4444",
  FATAL: "#cc44cc",
};

// ---------------------------------------------------------------------------
// Source colors - rotate through a palette for different sources
// ---------------------------------------------------------------------------

const SOURCE_PALETTE = [
  "#4a9eff",
  "#44cc88",
  "#cc8844",
  "#cc44cc",
  "#44cccc",
  "#cccc44",
  "#ff6688",
  "#88aaff",
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
  backgroundColor: isSelected ? "#1e1e3a" : "transparent",
  borderBottom: "1px solid #1a1a2e",
  borderLeft: isSelected ? "3px solid #4a9eff" : "3px solid transparent",
  alignItems: "center",
  fontSize: "13px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  transition: "background-color 0.1s ease",
});

const timestampStyle: React.CSSProperties = {
  color: "#a0a0c0",
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
  color: "#d0d0e0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sourceTagStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: "3px",
  backgroundColor: color + "22",
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
