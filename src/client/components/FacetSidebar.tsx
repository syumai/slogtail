import { useState, useCallback, useEffect, useMemo } from "react";
import type { FacetDefinition } from "../../types";
import type { QueryFilters } from "../api";
import { useFilters } from "../store";
import { FacetPanel } from "./FacetPanel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "slogtail-facets";

const DEFAULT_FACETS: FacetDefinition[] = [
  { field: "level", displayName: "Level", jsonPath: null, isDefault: true },
  { field: "service", displayName: "Service", jsonPath: null, isDefault: true },
  { field: "host", displayName: "Host", jsonPath: null, isDefault: true },
];

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadCustomFacets(): FacetDefinition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FacetDefinition[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f) =>
        typeof f.field === "string" &&
        typeof f.displayName === "string" &&
        !f.isDefault,
    );
  } catch {
    return [];
  }
}

function saveCustomFacets(facets: FacetDefinition[]): void {
  try {
    const custom = facets.filter((f) => !f.isDefault);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    // Ignore storage errors silently
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sidebarStyle: React.CSSProperties = {
  width: "240px",
  minWidth: "240px",
  backgroundColor: "#fafafa",
  borderRight: "1px solid #e0e0e0",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const sidebarHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: "1px solid #e0e0e0",
  fontSize: "13px",
  fontWeight: "bold",
  color: "#333333",
};

const facetListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
};

const addSectionStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderTop: "1px solid #e0e0e0",
};

const addButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  backgroundColor: "#f5f5f5",
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  color: "#666666",
  cursor: "pointer",
  fontSize: "12px",
  textAlign: "left",
};

const addFormStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const addInputStyle: React.CSSProperties = {
  padding: "6px 8px",
  backgroundColor: "#ffffff",
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  color: "#333333",
  fontSize: "12px",
  outline: "none",
};

const addFormButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
};

const addConfirmButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  backgroundColor: "#dcfce7",
  border: "1px solid #86efac",
  borderRadius: "4px",
  color: "#16a34a",
  cursor: "pointer",
  fontSize: "11px",
};

const addCancelButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  backgroundColor: "#f5f5f5",
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  color: "#666666",
  cursor: "pointer",
  fontSize: "11px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FacetSidebar() {
  const [filters, actions] = useFilters();

  // Facet definitions (default + custom from localStorage)
  const [customFacets, setCustomFacets] = useState<FacetDefinition[]>(() =>
    loadCustomFacets(),
  );

  const allFacets = useMemo(
    () => [...DEFAULT_FACETS, ...customFacets],
    [customFacets],
  );

  // Persist custom facets whenever they change
  useEffect(() => {
    saveCustomFacets(customFacets);
  }, [customFacets]);

  // Build query filters to pass to each FacetPanel
  const queryFilters: Partial<QueryFilters> = useMemo(
    () => ({
      search: filters.search,
      level: filters.level.length > 0 ? filters.level : undefined,
      service: filters.service.length > 0 ? filters.service : undefined,
      host: filters.host.length > 0 ? filters.host : undefined,
      source: filters.source.length > 0 ? filters.source : undefined,
      startTime: filters.startTime,
      endTime: filters.endTime,
      jsonFilters: Object.keys(filters.jsonFilters).length > 0 ? filters.jsonFilters : undefined,
    }),
    [
      filters.search,
      filters.level,
      filters.service,
      filters.host,
      filters.source,
      filters.startTime,
      filters.endTime,
      filters.jsonFilters,
    ],
  );

  // Periodic facet refetch interval during live tail (ms), 0 to disable
  const facetRefetchInterval = filters.isLiveTail ? 2000 : 0;

  // Derive selected values from current filter state
  const getSelectedValues = useCallback(
    (field: string): string[] => {
      switch (field) {
        case "level":
          return filters.level;
        case "service":
          return filters.service;
        case "host":
          return filters.host;
        case "source":
          return filters.source;
        default:
          return filters.jsonFilters[field] ?? [];
      }
    },
    [filters.level, filters.service, filters.host, filters.source, filters.jsonFilters],
  );

  // Handle facet value toggle (add/remove from selection)
  const handleToggle = useCallback(
    (field: string, value: string) => {
      switch (field) {
        case "level":
          actions.toggleLevel(
            value as "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL",
          );
          break;
        case "service":
          actions.toggleService(value);
          break;
        case "host":
          actions.toggleHost(value);
          break;
        case "source":
          actions.toggleSource(value);
          break;
        default:
          actions.toggleJsonFilter(field, value);
          break;
      }
    },
    [actions],
  );

  // Handle custom facet removal
  const handleRemove = useCallback((field: string) => {
    setCustomFacets((prev) => prev.filter((f) => f.field !== field));
  }, []);

  // Add custom facet form state
  const [isAdding, setIsAdding] = useState(false);
  const [addFieldPath, setAddFieldPath] = useState("");

  const handleAddSubmit = useCallback(() => {
    const trimmed = addFieldPath.trim();
    if (!trimmed) return;

    // Check for duplicates
    const exists = allFacets.some((f) => {
      if (f.jsonPath) return f.jsonPath === trimmed;
      return f.field === trimmed;
    });
    if (exists) {
      setAddFieldPath("");
      setIsAdding(false);
      return;
    }

    // Derive display name from the last segment of the path
    const segments = trimmed.split(".");
    const displayName = segments[segments.length - 1] ?? trimmed;

    const newFacet: FacetDefinition = {
      field: trimmed,
      displayName,
      jsonPath: trimmed,
      isDefault: false,
    };

    setCustomFacets((prev) => [...prev, newFacet]);
    setAddFieldPath("");
    setIsAdding(false);
  }, [addFieldPath, allFacets]);

  const handleAddCancel = useCallback(() => {
    setAddFieldPath("");
    setIsAdding(false);
  }, []);

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleAddSubmit();
      } else if (e.key === "Escape") {
        handleAddCancel();
      }
    },
    [handleAddSubmit, handleAddCancel],
  );

  return (
    <div style={sidebarStyle}>
      <div style={sidebarHeaderStyle}>
        <span>Facets</span>
      </div>

      <div style={facetListStyle}>
        {allFacets.map((facet) => (
          <FacetPanel
            key={facet.jsonPath ?? facet.field}
            definition={facet}
            filters={queryFilters}
            selectedValues={getSelectedValues(facet.field)}
            refetchIntervalMs={facetRefetchInterval}
            onToggle={handleToggle}
            onRemove={handleRemove}
          />
        ))}
      </div>

      <div style={addSectionStyle}>
        {!isAdding ? (
          <button style={addButtonStyle} onClick={() => setIsAdding(true)}>
            + Add custom facet
          </button>
        ) : (
          <div style={addFormStyle}>
            <input
              type="text"
              placeholder="Field path (e.g. metadata.region)"
              value={addFieldPath}
              onChange={(e) => setAddFieldPath(e.target.value)}
              onKeyDown={handleAddKeyDown}
              style={addInputStyle}
              autoFocus
            />
            <div style={addFormButtonsStyle}>
              <button style={addConfirmButtonStyle} onClick={handleAddSubmit}>
                Add
              </button>
              <button style={addCancelButtonStyle} onClick={handleAddCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
