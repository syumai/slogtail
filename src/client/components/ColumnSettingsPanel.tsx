import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDefinition } from "./useColumnConfig";

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  width: "320px",
  backgroundColor: "#ffffff",
  border: "1px solid #d0d0d0",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
  zIndex: 20,
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: "13px",
  fontWeight: "bold",
  color: "#333333",
};

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  maxHeight: "240px",
  overflowY: "auto",
  paddingRight: "2px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  fontSize: "12px",
  color: "#333333",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flex: 1,
  minWidth: 0,
};

const columnMetaStyle: React.CSSProperties = {
  color: "#888888",
  fontSize: "11px",
};

const removeButtonStyle: React.CSSProperties = {
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  backgroundColor: "#f8f8f8",
  color: "#666666",
  fontSize: "11px",
  padding: "2px 6px",
  cursor: "pointer",
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#666666",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const addFormStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto",
  gap: "6px",
  alignItems: "center",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  fontSize: "12px",
  color: "#333333",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  backgroundColor: "#f5f5f5",
  color: "#333333",
  fontSize: "12px",
  padding: "6px 10px",
  cursor: "pointer",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

interface ColumnSettingsPanelProps {
  isOpen: boolean;
  columns: ColumnDefinition[];
  onClose(): void;
  onToggleColumnVisibility(id: string): void;
  onAddColumn(field: string, label: string, jsonPath: string | null): void;
  onRemoveColumn(id: string): void;
  onResetToDefault(): void;
}

function deriveLabel(jsonPath: string): string {
  const segments = jsonPath.split(".").filter(Boolean);
  return segments[segments.length - 1] ?? jsonPath;
}

export function ColumnSettingsPanel({
  isOpen,
  columns,
  onClose,
  onToggleColumnVisibility,
  onAddColumn,
  onRemoveColumn,
  onResetToDefault,
}: ColumnSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [jsonPathInput, setJsonPathInput] = useState("");
  const [labelInput, setLabelInput] = useState("");

  const visibleCount = useMemo(
    () => columns.filter((column) => column.visible).length,
    [columns],
  );

  const handleAddColumn = useCallback(() => {
    const jsonPath = jsonPathInput.trim();
    if (!jsonPath) return;
    const label = labelInput.trim() || deriveLabel(jsonPath);
    onAddColumn(jsonPath, label, jsonPath);
    setJsonPathInput("");
    setLabelInput("");
  }, [jsonPathInput, labelInput, onAddColumn]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsidePointerDown = (event: MouseEvent) => {
      if (!panelRef.current) return;
      const targetNode = event.target as Node;
      if (!panelRef.current.contains(targetNode)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={panelStyle} ref={panelRef}>
      <div style={headerStyle}>
        <span>Column Settings</span>
        <button type="button" style={buttonStyle} onClick={onClose}>
          Close
        </button>
      </div>

      <div style={sectionTitleStyle}>Visible Columns</div>
      <div style={listStyle}>
        {columns.map((column) => {
          const disableToggle = column.visible && visibleCount <= 1;
          return (
            <div key={column.id} style={rowStyle}>
              <label style={labelStyle}>
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={() => onToggleColumnVisibility(column.id)}
                  disabled={disableToggle}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {column.label}
                  <span style={columnMetaStyle}>
                    {" "}
                    ({column.width > 0 ? `${column.width}px` : "flex"})
                  </span>
                </span>
              </label>
              {!column.jsonPath ? null : (
                <button
                  type="button"
                  style={removeButtonStyle}
                  onClick={() => onRemoveColumn(column.id)}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={sectionTitleStyle}>Add JSON Column</div>
      <div style={addFormStyle}>
        <input
          type="text"
          value={jsonPathInput}
          placeholder="JSON path (e.g. metadata.trace_id)"
          style={inputStyle}
          onChange={(event) => setJsonPathInput(event.target.value)}
        />
        <input
          type="text"
          value={labelInput}
          placeholder="Label (optional)"
          style={inputStyle}
          onChange={(event) => setLabelInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAddColumn();
          }}
        />
        <button type="button" style={buttonStyle} onClick={handleAddColumn}>
          Add
        </button>
      </div>

      <div style={footerStyle}>
        <span style={columnMetaStyle}>At least one column must stay visible.</span>
        <button type="button" style={buttonStyle} onClick={onResetToDefault}>
          Reset
        </button>
      </div>
    </div>
  );
}
