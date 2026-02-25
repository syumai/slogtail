import { memo, useRef } from "react";
import type { SerializedLogEntry } from "../api";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 480;

const panelStyle = (isOpen: boolean): React.CSSProperties => ({
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: `${PANEL_WIDTH}px`,
  backgroundColor: "#12122a",
  borderLeft: "1px solid #2a2a4a",
  transform: isOpen ? "translateX(0)" : `translateX(${PANEL_WIDTH}px)`,
  transition: "transform 0.25s ease-in-out",
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  boxShadow: isOpen ? "-4px 0 20px rgba(0, 0, 0, 0.5)" : "none",
});

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid #2a2a4a",
  fontSize: "14px",
  fontWeight: "bold",
  color: "#e0e0ff",
  flexShrink: 0,
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#a0a0c0",
  cursor: "pointer",
  fontSize: "18px",
  padding: "4px 8px",
  borderRadius: "4px",
  lineHeight: 1,
};

const panelBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 16px",
  fontSize: "12px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
};

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  padding: "4px 0",
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
  overflow: "auto",
  fontSize: "12px",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderField(name: string, value: string) {
  return (
    <div style={fieldRowStyle} key={name}>
      <span style={fieldNameStyle}>{name}</span>
      <span style={fieldValueStyle}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogDetailPanelProps {
  log: SerializedLogEntry | null;
  onClose: () => void;
}

export const LogDetailPanel = memo(function LogDetailPanel({
  log,
  onClose,
}: LogDetailPanelProps) {
  const isOpen = log !== null;

  // Keep last log for smooth slide-out animation
  const lastLogRef = useRef<SerializedLogEntry | null>(null);
  if (log) lastLogRef.current = log;
  const displayLog = log ?? lastLogRef.current;

  return (
    <div style={panelStyle(isOpen)}>
      {displayLog && (
        <>
          <div style={panelHeaderStyle}>
            <span>Log Detail</span>
            <button
              style={closeButtonStyle}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div style={panelBodyStyle}>
            {renderField("_id", displayLog._id)}
            {renderField("_ingested", displayLog._ingested)}
            {renderField("timestamp", displayLog.timestamp ?? "null")}
            {renderField("level", displayLog.level ?? "null")}
            {renderField("message", displayLog.message ?? "null")}
            {renderField("service", displayLog.service ?? "null")}
            {renderField("trace_id", displayLog.trace_id ?? "null")}
            {renderField("host", displayLog.host ?? "null")}
            {renderField(
              "duration_ms",
              displayLog.duration_ms !== null
                ? String(displayLog.duration_ms)
                : "null",
            )}
            {renderField("source", displayLog.source)}
            <div style={{ marginTop: "12px" }}>
              <span style={fieldNameStyle}>_raw</span>
              <pre style={rawJsonStyle}>
                {JSON.stringify(displayLog._raw, null, 2)}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
