import { useState, useCallback } from "react";
import type { FilterState } from "../store";
import { useFilters } from "../store";
import type { LogLevel } from "../../types";
import { LOG_LEVELS } from "../../types";

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Validate that startTime is not after endTime.
 * Returns true if the range is valid (or partially/fully unset).
 * Returns false if startTime > endTime.
 */
export function isValidTimeRange(
  startTime: Date | undefined,
  endTime: Date | undefined,
): boolean {
  if (startTime && endTime) {
    return startTime.getTime() <= endTime.getTime();
  }
  return true;
}

/**
 * Format a Date to a "YYYY-MM-DDTHH:mm" string for datetime-local input.
 * Returns empty string for undefined.
 */
export function formatDatetimeLocal(d: Date | undefined): string {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Parse a "YYYY-MM-DDTHH:mm" string from datetime-local input to Date.
 * Returns undefined for empty or invalid strings.
 */
export function parseDatetimeLocal(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

// ---------------------------------------------------------------------------
// Filter tag helpers
// ---------------------------------------------------------------------------

export interface FilterTag {
  key: string;
  label: string;
  onRemove(): void;
}

export function buildFilterTags(
  filters: FilterState,
  actions: {
    setLevel(v: LogLevel | undefined): void;
    setService(v: string | undefined): void;
    setHost(v: string | undefined): void;
    setSource(v: string | undefined): void;
    setSearch(v: string | undefined): void;
    setTimeRange(s: Date | undefined, e: Date | undefined): void;
  },
): FilterTag[] {
  const tags: FilterTag[] = [];

  if (filters.level.length > 0) {
    tags.push({
      key: "level",
      label: `level: ${filters.level.join(", ")}`,
      onRemove: () => actions.setLevel(undefined),
    });
  }
  if (filters.service.length > 0) {
    tags.push({
      key: "service",
      label: `service: ${filters.service.join(", ")}`,
      onRemove: () => actions.setService(undefined),
    });
  }
  if (filters.host.length > 0) {
    tags.push({
      key: "host",
      label: `host: ${filters.host.join(", ")}`,
      onRemove: () => actions.setHost(undefined),
    });
  }
  if (filters.source.length > 0) {
    tags.push({
      key: "source",
      label: `source: ${filters.source.join(", ")}`,
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

const datetimeInputStyle: React.CSSProperties = {
  padding: "8px 12px",
  backgroundColor: "#0f0f23",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: "#e0e0e0",
  fontSize: "13px",
  outline: "none",
};

const datetimeLabelStyle: React.CSSProperties = {
  color: "#a0a0c0",
  fontSize: "12px",
  marginRight: "4px",
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

  const handleStartTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = parseDatetimeLocal(e.target.value);
      // Guard: if start > end, do not apply the filter
      if (!isValidTimeRange(newStart, filters.endTime)) return;
      actions.setTimeRange(newStart, filters.endTime);
    },
    [actions, filters.endTime],
  );

  const handleEndTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newEnd = parseDatetimeLocal(e.target.value);
      // Guard: if start > end, do not apply the filter
      if (!isValidTimeRange(filters.startTime, newEnd)) return;
      actions.setTimeRange(filters.startTime, newEnd);
    },
    [actions, filters.startTime],
  );

  const tags = buildFilterTags(filters, actions);

  // Show first selected level in dropdown (or empty for "All Levels")
  const dropdownLevel = filters.level.length === 1 ? filters.level[0] : "";

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
          value={dropdownLevel}
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

      {/* Time range picker row */}
      <div style={rowStyle}>
        <span style={datetimeLabelStyle}>From:</span>
        <input
          type="datetime-local"
          value={formatDatetimeLocal(filters.startTime)}
          onChange={handleStartTimeChange}
          style={datetimeInputStyle}
        />
        <span style={datetimeLabelStyle}>To:</span>
        <input
          type="datetime-local"
          value={formatDatetimeLocal(filters.endTime)}
          onChange={handleEndTimeChange}
          style={datetimeInputStyle}
        />
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
