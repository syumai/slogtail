import { memo, useCallback, useMemo, useRef } from "react";
import { useFacets } from "../api";
import type { QueryFilters } from "../api";
import type { FacetDefinition } from "../../types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FacetPanelProps {
  definition: FacetDefinition;
  filters: Partial<QueryFilters>;
  /** Currently selected values for this facet (empty array if none). */
  selectedValues: string[];
  /** Periodic refetch interval in ms (e.g. during live tail). 0 or undefined to disable. */
  refetchIntervalMs?: number;
  /** Called when user clicks a facet value to toggle selection. */
  onToggle(field: string, value: string): void;
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
  color: "#666666",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const removeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#999",
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
  color: isSelected ? "#ffffff" : "#333333",
  backgroundColor: isSelected ? "#1a73e8" : "transparent",
  fontWeight: isSelected ? "bold" : "normal",
  transition: "background-color 0.15s ease",
});

const valueNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginRight: "8px",
};

const valueCountStyle = (isSelected: boolean): React.CSSProperties => ({
  flexShrink: 0,
  color: isSelected ? "#bbd4ff" : "#999999",
  fontSize: "11px",
});

const emptyStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: "11px",
  color: "#999999",
  fontStyle: "italic",
};

const loadingStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: "11px",
  color: "#999999",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FacetPanel = memo(function FacetPanel({
  definition,
  filters,
  selectedValues,
  refetchIntervalMs,
  onToggle,
  onRemove,
}: FacetPanelProps) {
  // Use the same filters as the log query so counts match displayed results.
  // Previously-seen values with 0 count are still shown via seenValuesRef below.
  const { values, isLoading } = useFacets(
    definition.field,
    definition.jsonPath,
    filters,
    refetchIntervalMs,
  );

  // Track all values ever seen for this facet to preserve 0-count items.
  const seenValuesRef = useRef<Map<string, number>>(new Map());
  const mergedValues = useMemo(() => {
    // Update seen values with latest counts
    for (const v of values) {
      seenValuesRef.current.set(v.value, v.count);
    }
    // Set 0 for previously seen values not in current results
    const currentKeys = new Set(values.map((v) => v.value));
    for (const key of seenValuesRef.current.keys()) {
      if (!currentKeys.has(key)) {
        seenValuesRef.current.set(key, 0);
      }
    }
    // Build sorted array: by count desc, then alphabetically
    return [...seenValuesRef.current.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [values]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const handleValueClick = useCallback(
    (value: string) => {
      onToggle(definition.field, value);
    },
    [definition.field, onToggle],
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

      {isLoading && mergedValues.length === 0 && (
        <div style={loadingStyle}>Loading...</div>
      )}

      {!isLoading && mergedValues.length === 0 && (
        <div style={emptyStyle}>No values</div>
      )}

      {mergedValues.length > 0 && (
        <ul style={valueListStyle}>
          {mergedValues.map((v) => {
            const isSelected = selectedSet.has(v.value);
            return (
              <li
                key={v.value}
                style={valueItemStyle(isSelected)}
                onClick={() => handleValueClick(v.value)}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "#f0f0f0";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "transparent";
                  }
                }}
              >
                <span style={valueNameStyle}>{v.value || "(empty)"}</span>
                <span style={valueCountStyle(isSelected)}>
                  {v.count.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
