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

// ---------------------------------------------------------------------------
// Excluded keys (hidden from detail panel)
// ---------------------------------------------------------------------------

export const EXCLUDED_KEYS: ReadonlySet<string> = new Set(["_id", "_ingested"]);

// ---------------------------------------------------------------------------
// flattenObject - Flatten a JSON object into a list of dot-separated key/value pairs
// ---------------------------------------------------------------------------

const MAX_DEPTH = 10;

export function flattenObject(
  obj: Record<string, unknown>,
  prefix?: string,
  _seen?: WeakSet<object>,
  _depth?: number,
): Array<{ key: string; value: unknown }> {
  const seen = _seen ?? new WeakSet<object>();
  const depth = _depth ?? 0;
  const result: Array<{ key: string; value: unknown }> = [];

  // Add the current object to seen to detect self-references
  seen.add(obj);

  for (const [k, v] of Object.entries(obj)) {
    // Exclude management properties at top level only (no prefix)
    if (!prefix && EXCLUDED_KEYS.has(k)) {
      continue;
    }

    const fullKey = prefix ? `${prefix}.${k}` : k;

    // Check if value is a plain object (not array, not null)
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      // Circular reference detection
      if (seen.has(v as object)) {
        continue;
      }
      seen.add(v as object);

      // Max depth check
      if (depth >= MAX_DEPTH - 1) {
        result.push({ key: fullKey, value: v });
        continue;
      }

      // Recurse into nested object
      const nested = flattenObject(
        v as Record<string, unknown>,
        fullKey,
        seen,
        depth + 1,
      );

      // If nested object is empty, skip it entirely
      if (nested.length > 0) {
        result.push(...nested);
      }
    } else {
      result.push({ key: fullKey, value: v });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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
            {flattenObject(displayLog._raw).map(({ key, value }) => (
              <div style={fieldRowStyle} key={key}>
                <span style={fieldNameStyle}>{key}</span>
                <span style={fieldValueStyle}>{formatValue(value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
