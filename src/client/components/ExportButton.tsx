import { useState, useCallback, useRef, useEffect } from "react";
import { useFilters } from "../store";
import { exportLogs } from "../api";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const wrapperStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "#0f0f23",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#e0e0e0",
  fontSize: "14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const buttonDisabledStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: "not-allowed",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "4px",
  backgroundColor: "#1a1a2e",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  zIndex: 100,
  minWidth: "120px",
  overflow: "hidden",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 14px",
  backgroundColor: "transparent",
  border: "none",
  color: "#e0e0e0",
  fontSize: "14px",
  textAlign: "left",
  cursor: "pointer",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportButton() {
  const [filters] = useFilters();
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleExport = useCallback(
    async (format: "csv" | "json") => {
      setIsOpen(false);
      setIsExporting(true);
      try {
        await exportLogs(format, {
          search: filters.search,
          level: filters.level,
          service: filters.service,
          source: filters.source,
          startTime: filters.startTime,
          endTime: filters.endTime,
        });
      } catch (err) {
        console.error("Export failed:", err);
      } finally {
        setIsExporting(false);
      }
    },
    [filters],
  );

  return (
    <div ref={wrapperRef} style={wrapperStyle}>
      <button
        style={isExporting ? buttonDisabledStyle : buttonStyle}
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isExporting}
        title="Export logs"
      >
        {isExporting ? "Exporting..." : "Export"}
      </button>
      {isOpen && (
        <div style={dropdownStyle}>
          <button
            style={dropdownItemStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "#2a2a4a";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "transparent";
            }}
            onClick={() => handleExport("csv")}
          >
            CSV
          </button>
          <button
            style={dropdownItemStyle}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "#2a2a4a";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "transparent";
            }}
            onClick={() => handleExport("json")}
          >
            JSON
          </button>
        </div>
      )}
    </div>
  );
}
