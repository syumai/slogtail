import { useCallback } from "react";
import { useFacets } from "../api";
import type { QueryFilters } from "../api";
import type { FacetDefinition } from "../../types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FacetPanelProps {
  definition: FacetDefinition;
  filters: Partial<QueryFilters>;
  /** Currently selected value for this facet (null if none). */
  selectedValue: string | null;
  /** Periodic refetch interval in ms (e.g. during live tail). 0 or undefined to disable. */
  refetchIntervalMs?: number;
  /** Called when user clicks a facet value to select or deselect it. */
  onSelect(field: string, value: string | null): void;
  /** Called when user removes a custom (non-default) facet. */
  onRemove?(field: string): void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  marginBottom: "4px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 12px",
  cursor: "pointer",
  userSelect: "none",
  fontSize: "12px",
  fontWeight: "bold",
  color: "#a0a0c0",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const removeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#666",
  cursor: "pointer",
  fontSize: "14px",
  padding: "0 2px",
  lineHeight: 1,
};

const valueListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: "0 8px 4px 8px",
};

const valueItemStyle = (isSelected: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "3px 8px",
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "12px",
  color: isSelected ? "#e0e0ff" : "#c0c0d0",
  backgroundColor: isSelected ? "#2a3a6a" : "transparent",
  transition: "background-color 0.15s ease",
});

const valueNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginRight: "8px",
};

const valueCountStyle: React.CSSProperties = {
  flexShrink: 0,
  color: "#6a6a9a",
  fontSize: "11px",
};

const emptyStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: "11px",
  color: "#555",
  fontStyle: "italic",
};

const loadingStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: "11px",
  color: "#6a6a9a",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FacetPanel({
  definition,
  filters,
  selectedValue,
  refetchIntervalMs,
  onSelect,
  onRemove,
}: FacetPanelProps) {
  const { values, isLoading } = useFacets(
    definition.field,
    definition.jsonPath,
    filters,
    refetchIntervalMs,
  );

  const handleValueClick = useCallback(
    (value: string) => {
      if (selectedValue === value) {
        // Deselect
        onSelect(definition.field, null);
      } else {
        onSelect(definition.field, value);
      }
    },
    [definition.field, selectedValue, onSelect],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.(definition.field);
    },
    [definition.field, onRemove],
  );

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>{definition.displayName}</span>
        {!definition.isDefault && onRemove && (
          <button
            style={removeButtonStyle}
            onClick={handleRemove}
            title={`Remove ${definition.displayName} facet`}
          >
            x
          </button>
        )}
      </div>

      {isLoading && values.length === 0 && (
        <div style={loadingStyle}>Loading...</div>
      )}

      {!isLoading && values.length === 0 && (
        <div style={emptyStyle}>No values</div>
      )}

      {values.length > 0 && (
        <ul style={valueListStyle}>
          {values.map((v) => (
            <li
              key={v.value}
              style={valueItemStyle(selectedValue === v.value)}
              onClick={() => handleValueClick(v.value)}
              onMouseEnter={(e) => {
                if (selectedValue !== v.value) {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "#1a1a3a";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedValue !== v.value) {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    "transparent";
                }
              }}
            >
              <span style={valueNameStyle}>{v.value || "(empty)"}</span>
              <span style={valueCountStyle}>{v.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
