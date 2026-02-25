import { memo, useState, useCallback } from "react";
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

const rowStyle = (isExpanded: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "160px 60px 1fr 100px",
  gap: "8px",
  padding: "6px 16px",
  cursor: "pointer",
  backgroundColor: isExpanded ? "#1e1e3a" : "transparent",
  borderBottom: "1px solid #1a1a2e",
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

const expandedStyle: React.CSSProperties = {
  padding: "12px 16px 12px 32px",
  backgroundColor: "#12122a",
  borderBottom: "1px solid #2a2a4a",
  fontSize: "12px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
};

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  padding: "2px 0",
};

const fieldNameStyle: React.CSSProperties = {
  color: "#6a6a9a",
  minWidth: "120px",
  flexShrink: 0,
};

const fieldValueStyle: React.CSSProperties = {
  color: "#d0d0e0",
  wordBreak: "break-all",
};

const rawJsonStyle: React.CSSProperties = {
  marginTop: "8px",
  padding: "8px",
  backgroundColor: "#0a0a1a",
  borderRadius: "4px",
  color: "#a0a0c0",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: "300px",
  overflow: "auto",
  fontSize: "12px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogRowProps {
  log: SerializedLogEntry;
}

export const LogRow = memo(function LogRow({ log }: LogRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const ts = log.timestamp
    ? new Date(log.timestamp).toISOString().replace("T", " ").slice(0, 23)
    : "--";

  const sColor = sourceColor(log.source);

  return (
    <>
      <div
        style={rowStyle(isExpanded)}
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") toggle();
        }}
      >
        <span style={timestampStyle}>{ts}</span>
        <span style={levelStyle(log.level)}>{log.level ?? "-"}</span>
        <span style={messageStyle}>{log.message ?? ""}</span>
        <span style={sourceTagStyle(sColor)}>{log.source}</span>
      </div>
      {isExpanded && (
        <div style={expandedStyle}>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>_id</span>
            <span style={fieldValueStyle}>{log._id}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>_ingested</span>
            <span style={fieldValueStyle}>{log._ingested}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>timestamp</span>
            <span style={fieldValueStyle}>{log.timestamp ?? "null"}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>level</span>
            <span style={fieldValueStyle}>{log.level ?? "null"}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>message</span>
            <span style={fieldValueStyle}>{log.message ?? "null"}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>service</span>
            <span style={fieldValueStyle}>{log.service ?? "null"}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>trace_id</span>
            <span style={fieldValueStyle}>{log.trace_id ?? "null"}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>host</span>
            <span style={fieldValueStyle}>{log.host ?? "null"}</span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>duration_ms</span>
            <span style={fieldValueStyle}>
              {log.duration_ms !== null ? String(log.duration_ms) : "null"}
            </span>
          </div>
          <div style={fieldRowStyle}>
            <span style={fieldNameStyle}>source</span>
            <span style={fieldValueStyle}>{log.source}</span>
          </div>
          <div>
            <span style={fieldNameStyle}>_raw</span>
            <pre style={rawJsonStyle}>
              {JSON.stringify(log._raw, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
});
