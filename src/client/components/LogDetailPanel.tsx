import { memo, useRef } from "react";
import type { SerializedLogEntry } from "../api";
import { useResizablePanel } from "./useResizablePanel";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 1200;

const panelStyle = (isOpen: boolean, width: number): React.CSSProperties => ({
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: `${width}px`,
  backgroundColor: "#12122a",
  borderLeft: "1px solid #2a2a4a",
  transform: isOpen ? "translateX(0)" : `translateX(${width}px)`,
  transition: isOpen ? "none" : "transform 0.25s ease-in-out",
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  boxShadow: isOpen ? "-4px 0 20px rgba(0, 0, 0, 0.5)" : "none",
});

const resizeHandleStyle = (isResizing: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  left: 0,
  bottom: 0,
  width: "4px",
  cursor: "col-resize",
  backgroundColor: isResizing ? "#3a3a5a" : "transparent",
  zIndex: 101,
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

export const panelBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 16px",
  fontSize: "14px",
  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
};

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  padding: "4px 0",
  alignItems: "flex-start",
};

const fieldNameStyle: React.CSSProperties = {
  color: "#6a6a9a",
  minWidth: "120px",
  flexShrink: 0,
};

const fieldValueStyle: React.CSSProperties = {
  color: "#d0d0e0",
  wordBreak: "break-all",
  flex: 1,
};

const copyButtonStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #3a3a5a",
  color: "#a0a0c0",
  cursor: "pointer",
  fontSize: "11px",
  padding: "1px 6px",
  borderRadius: "3px",
  flexShrink: 0,
  lineHeight: 1.4,
};

const headerButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

// ---------------------------------------------------------------------------
// Excluded keys (hidden from detail panel)
// ---------------------------------------------------------------------------

export const EXCLUDED_KEYS: ReadonlySet<string> = new Set(["_id", "_ingested"]);

// ---------------------------------------------------------------------------
// trace_id key constant (Req 6.9)
// ---------------------------------------------------------------------------

export const TRACE_ID_KEY = "trace_id";

const traceIdClickableStyle: React.CSSProperties = {
  cursor: "pointer",
  textDecoration: "underline",
};

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
// valueColorStyle - type-based color differentiation (Req 6.6)
// ---------------------------------------------------------------------------

export function valueColorStyle(value: unknown): React.CSSProperties {
  if (typeof value === "number") {
    return { color: "#1a73e8" }; // blue for numbers
  }
  if (typeof value === "boolean") {
    return { color: "#e67e22" }; // orange for booleans
  }
  if (value === null) {
    return { color: "#999999" }; // grey for null
  }
  // string, undefined, object, array -> default (no color override)
  return {};
}

// ---------------------------------------------------------------------------
// copyToClipboard - clipboard helper (Req 6.4, 6.5)
// ---------------------------------------------------------------------------

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) {
    console.warn("Clipboard API is not available");
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn("Failed to copy to clipboard:", err);
    return false;
  }
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
  onTraceIdClick?: (traceId: string) => void;
}

export const LogDetailPanel = memo(function LogDetailPanel({
  log,
  onClose,
  onTraceIdClick,
}: LogDetailPanelProps) {
  const isOpen = log !== null;

  const { width, isResizing, handleMouseDown } = useResizablePanel({
    initialWidth: DEFAULT_PANEL_WIDTH,
    minWidth: MIN_PANEL_WIDTH,
    maxWidth: MAX_PANEL_WIDTH,
  });

  // Keep last log for smooth slide-out animation
  const lastLogRef = useRef<SerializedLogEntry | null>(null);
  if (log) lastLogRef.current = log;
  const displayLog = log ?? lastLogRef.current;

  return (
    <div style={panelStyle(isOpen, width)}>
      {/* Resize handle */}
      <div
        style={resizeHandleStyle(isResizing)}
        onMouseDown={handleMouseDown}
      />
      {displayLog && (
        <>
          <div style={panelHeaderStyle}>
            <span>Log Detail</span>
            <div style={headerButtonsStyle}>
              <button
                style={copyButtonStyle}
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(displayLog._raw, null, 2),
                  )
                }
                aria-label="Copy JSON"
              >
                Copy JSON
              </button>
              <button
                style={closeButtonStyle}
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
          <div style={panelBodyStyle}>
            {flattenObject(displayLog._raw).map(({ key, value }) => (
              <div style={fieldRowStyle} key={key}>
                <span style={fieldNameStyle}>{key}</span>
                <span
                  style={{
                    ...fieldValueStyle,
                    ...valueColorStyle(value),
                    ...(key === TRACE_ID_KEY && typeof value === "string"
                      ? traceIdClickableStyle
                      : {}),
                  }}
                  onClick={
                    key === TRACE_ID_KEY &&
                    typeof value === "string" &&
                    onTraceIdClick
                      ? () => onTraceIdClick(value)
                      : undefined
                  }
                >
                  {formatValue(value)}
                </span>
                <button
                  style={copyButtonStyle}
                  onClick={() => copyToClipboard(formatValue(value))}
                  aria-label={`Copy ${key}`}
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
