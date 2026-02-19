import { useState, useCallback } from "react";
import type { FilterState } from "../store";
import { useFilters } from "../store";
import type { LogLevel } from "../../types";
import { LOG_LEVELS } from "../../types";

// ---------------------------------------------------------------------------
// Filter tag helpers
// ---------------------------------------------------------------------------

interface FilterTag {
  key: string;
  label: string;
  onRemove(): void;
}

function buildFilterTags(
  filters: FilterState,
  actions: {
    setLevel(v: LogLevel | undefined): void;
    setService(v: string | undefined): void;
    setSource(v: string | undefined): void;
    setSearch(v: string | undefined): void;
    setTimeRange(s: Date | undefined, e: Date | undefined): void;
  },
): FilterTag[] {
  const tags: FilterTag[] = [];

  if (filters.level) {
    tags.push({
      key: "level",
      label: `level: ${filters.level}`,
      onRemove: () => actions.setLevel(undefined),
    });
  }
  if (filters.service) {
    tags.push({
      key: "service",
      label: `service: ${filters.service}`,
      onRemove: () => actions.setService(undefined),
    });
  }
  if (filters.source) {
    tags.push({
      key: "source",
      label: `source: ${filters.source}`,
      onRemove: () => actions.setSource(undefined),
    });
  }
  if (filters.search) {
    tags.push({
      key: "search",
      label: `search: "${filters.search}"`,
      onRemove: () => actions.setSearch(undefined),
    });
  }
  if (filters.startTime || filters.endTime) {
    const start = filters.startTime
      ? filters.startTime.toISOString().slice(0, 19)
      : "*";
    const end = filters.endTime
      ? filters.endTime.toISOString().slice(0, 19)
      : "*";
    tags.push({
      key: "time",
      label: `time: ${start} ~ ${end}`,
      onRemove: () => actions.setTimeRange(undefined, undefined),
    });
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "12px 16px",
  backgroundColor: "#1a1a2e",
  borderBottom: "1px solid #2a2a4a",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: "200px",
  padding: "8px 12px",
  backgroundColor: "#0f0f23",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#e0e0e0",
  fontSize: "14px",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "#0f0f23",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#e0e0e0",
  fontSize: "14px",
  cursor: "pointer",
};

const tagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "4px 10px",
  backgroundColor: "#2a2a4a",
  borderRadius: "12px",
  color: "#c0c0e0",
  fontSize: "12px",
};

const tagRemoveStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  cursor: "pointer",
  fontSize: "14px",
  padding: "0 2px",
  lineHeight: 1,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchBar() {
  const [filters, actions] = useFilters();
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = searchInput.trim();
      actions.setSearch(trimmed || undefined);
    },
    [searchInput, actions],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        const trimmed = searchInput.trim();
        actions.setSearch(trimmed || undefined);
      }
    },
    [searchInput, actions],
  );

  const handleLevelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      actions.setLevel(value ? (value as LogLevel) : undefined);
    },
    [actions],
  );

  const tags = buildFilterTags(filters, actions);

  return (
    <div style={containerStyle}>
      <div style={rowStyle}>
        <form onSubmit={handleSearchSubmit} style={{ display: "contents" }}>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={inputStyle}
          />
        </form>
        <select
          value={filters.level ?? ""}
          onChange={handleLevelChange}
          style={selectStyle}
        >
          <option value="">All Levels</option>
          {LOG_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
      </div>

      {tags.length > 0 && (
        <div style={rowStyle}>
          {tags.map((tag) => (
            <span key={tag.key} style={tagStyle}>
              {tag.label}
              <button
                style={tagRemoveStyle}
                onClick={tag.onRemove}
                title={`Remove ${tag.key} filter`}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
