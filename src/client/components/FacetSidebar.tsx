import { useState, useCallback, useEffect, useMemo } from "react";
import type { FacetDefinition } from "../../types";
import type { QueryFilters } from "../api";
import { useFilters } from "../store";
import { FacetPanel } from "./FacetPanel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "lduck-facets";

const DEFAULT_FACETS: FacetDefinition[] = [
  { field: "level", displayName: "Level", jsonPath: null, isDefault: true },
  { field: "service", displayName: "Service", jsonPath: null, isDefault: true },
  { field: "host", displayName: "Host", jsonPath: null, isDefault: true },
  { field: "source", displayName: "Source", jsonPath: null, isDefault: true },
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
  backgroundColor: "#12122a",
  borderRight: "1px solid #2a2a4a",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const sidebarHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: "1px solid #2a2a4a",
  fontSize: "13px",
  fontWeight: "bold",
  color: "#d0d0e0",
};

const facetListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
};

const addSectionStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderTop: "1px solid #2a2a4a",
};

const addButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  backgroundColor: "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#a0a0c0",
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
  backgroundColor: "#0f0f23",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#e0e0e0",
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
  backgroundColor: "#2a4a2a",
  border: "1px solid #3a6a3a",
  borderRadius: "4px",
  color: "#88cc88",
  cursor: "pointer",
  fontSize: "11px",
};

const addCancelButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  backgroundColor: "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#a0a0c0",
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
      level: filters.level,
      service: filters.service,
      source: filters.source,
      startTime: filters.startTime,
      endTime: filters.endTime,
    }),
    [
      filters.search,
      filters.level,
      filters.service,
      filters.source,
      filters.startTime,
      filters.endTime,
    ],
  );

  // Periodic facet refetch interval during live tail (ms), 0 to disable
  const facetRefetchInterval = filters.isLiveTail ? 2000 : 0;

  // Derive selected values from current filter state
  const getSelectedValue = useCallback(
    (field: string): string | null => {
      switch (field) {
        case "level":
          return filters.level ?? null;
        case "service":
          return filters.service ?? null;
        case "source":
          return filters.source ?? null;
        default:
          return null;
      }
    },
    [filters.level, filters.service, filters.source],
  );

  // Handle facet value selection/deselection
  const handleSelect = useCallback(
    (field: string, value: string | null) => {
      switch (field) {
        case "level":
          actions.setLevel(
            value as
              | "DEBUG"
              | "INFO"
              | "WARN"
              | "ERROR"
              | "FATAL"
              | undefined,
          );
          break;
        case "service":
          actions.setService(value ?? undefined);
          break;
        case "source":
          actions.setSource(value ?? undefined);
          break;
        default:
          // Custom / non-filterable facets: no action
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
            selectedValue={getSelectedValue(facet.field)}
            refetchIntervalMs={facetRefetchInterval}
            onSelect={handleSelect}
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
