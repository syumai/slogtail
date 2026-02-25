import { useCallback, useEffect, useMemo, useState } from "react";
import { useHistogram } from "../api";
import { useFilters, type FilterState } from "../store";
import { HistogramChart } from "./HistogramChart";

type TimePreset = "live" | "15m" | "30m" | "1h" | "4h" | "12h" | "1d" | "custom";

const PRESET_LABELS: Record<TimePreset, string> = {
  live: "Live",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "12h": "12h",
  "1d": "1d",
  custom: "Custom",
};

const PRESET_ORDER: TimePreset[] = ["live", "15m", "30m", "1h", "4h", "12h", "1d", "custom"];

const PRESET_MS: Partial<Record<TimePreset, number>> = {
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "8px 16px",
  backgroundColor: "#fafafa",
  borderBottom: "1px solid #e0e0e0",
};

const topRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const presetsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  flexWrap: "wrap",
};

const presetButtonStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? "#2563eb" : "#d0d0d0"}`,
  backgroundColor: active ? "#dbeafe" : "#ffffff",
  color: active ? "#1d4ed8" : "#333333",
  borderRadius: "999px",
  padding: "4px 10px",
  fontSize: "12px",
  cursor: "pointer",
  fontWeight: active ? 600 : 400,
});

const currentRangeStyle: React.CSSProperties = {
  color: "#666666",
  fontSize: "12px",
};

const customRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  fontSize: "12px",
  padding: "5px 8px",
  color: "#333333",
  backgroundColor: "#ffffff",
};

const applyButtonStyle: React.CSSProperties = {
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  fontSize: "12px",
  padding: "5px 10px",
  color: "#333333",
  backgroundColor: "#ffffff",
  cursor: "pointer",
};

const histogramWrapStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "6px",
  overflow: "hidden",
  backgroundColor: "#ffffff",
};

export function formatDatetimeLocal(d: Date | undefined): string {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseDatetimeLocal(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export function inferTimePreset(filters: FilterState): TimePreset {
  if (filters.isLiveTail && !filters.startTime && !filters.endTime) {
    return "live";
  }
  if (!filters.startTime || !filters.endTime) {
    return "custom";
  }
  const durationMs = Math.abs(filters.endTime.getTime() - filters.startTime.getTime());
  for (const [preset, presetMs] of Object.entries(PRESET_MS) as Array<[TimePreset, number]>) {
    if (Math.abs(durationMs - presetMs) <= 60 * 1000) {
      return preset;
    }
  }
  return "custom";
}

function formatAppliedRange(filters: FilterState): string {
  if (filters.isLiveTail && !filters.startTime && !filters.endTime) {
    return "Live tail (latest logs)";
  }
  if (!filters.startTime || !filters.endTime) {
    return "Custom range not set";
  }
  return `${filters.startTime.toISOString().slice(0, 19)} ~ ${filters.endTime
    .toISOString()
    .slice(0, 19)}`;
}

export function TimeRangeBar() {
  const [filters, actions] = useFilters();
  const activePreset = useMemo(() => inferTimePreset(filters), [filters]);
  const [fromInput, setFromInput] = useState(formatDatetimeLocal(filters.startTime));
  const [toInput, setToInput] = useState(formatDatetimeLocal(filters.endTime));

  useEffect(() => {
    setFromInput(formatDatetimeLocal(filters.startTime));
    setToInput(formatDatetimeLocal(filters.endTime));
  }, [filters.startTime, filters.endTime]);

  const histogramQuery = useMemo(
    () => ({
      buckets: 30,
      search: filters.search,
      level: filters.level.length > 0 ? filters.level : undefined,
      service: filters.service.length > 0 ? filters.service : undefined,
      host: filters.host.length > 0 ? filters.host : undefined,
      source: filters.source.length > 0 ? filters.source : undefined,
      startTime: filters.isLiveTail ? undefined : filters.startTime,
      endTime: filters.isLiveTail ? undefined : filters.endTime,
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
      filters.isLiveTail,
      filters.jsonFilters,
    ],
  );

  const { data, isLoading, error, refetch } = useHistogram(histogramQuery);

  useEffect(() => {
    if (!filters.isLiveTail) return;
    refetch();
    const timer = setInterval(() => {
      refetch();
    }, 2000);
    return () => clearInterval(timer);
  }, [filters.isLiveTail, refetch]);

  const applyPreset = useCallback(
    (preset: TimePreset) => {
      if (preset === "live") {
        actions.updateFilters({
          isLiveTail: true,
          startTime: undefined,
          endTime: undefined,
        });
        return;
      }

      if (preset === "custom") {
        actions.updateFilters({ isLiveTail: false });
        if (!filters.startTime || !filters.endTime) {
          const end = new Date();
          const start = new Date(end.getTime() - 30 * 60 * 1000);
          actions.setTimeRange(start, end);
        }
        return;
      }

      const duration = PRESET_MS[preset];
      if (!duration) return;
      const end = new Date();
      const start = new Date(end.getTime() - duration);
      actions.updateFilters({
        isLiveTail: false,
        startTime: start,
        endTime: end,
      });
    },
    [actions, filters.endTime, filters.startTime],
  );

  const applyCustomRange = useCallback(() => {
    const start = parseDatetimeLocal(fromInput);
    const end = parseDatetimeLocal(toInput);
    if (!start || !end) return;
    if (start.getTime() > end.getTime()) return;
    actions.updateFilters({
      isLiveTail: false,
      startTime: start,
      endTime: end,
    });
  }, [actions, fromInput, toInput]);

  const selectedRange =
    !filters.isLiveTail && filters.startTime && filters.endTime
      ? { start: filters.startTime, end: filters.endTime }
      : null;

  return (
    <div style={containerStyle}>
      <div style={topRowStyle}>
        <div style={presetsStyle}>
          {PRESET_ORDER.map((preset) => (
            <button
              key={preset}
              type="button"
              style={presetButtonStyle(activePreset === preset)}
              onClick={() => applyPreset(preset)}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
        <span style={currentRangeStyle}>{formatAppliedRange(filters)}</span>
      </div>

      {activePreset === "custom" && (
        <div style={customRowStyle}>
          <span style={currentRangeStyle}>From</span>
          <input
            type="datetime-local"
            value={fromInput}
            onChange={(event) => setFromInput(event.target.value)}
            style={inputStyle}
          />
          <span style={currentRangeStyle}>To</span>
          <input
            type="datetime-local"
            value={toInput}
            onChange={(event) => setToInput(event.target.value)}
            style={inputStyle}
          />
          <button type="button" style={applyButtonStyle} onClick={applyCustomRange}>
            Apply
          </button>
        </div>
      )}

      <div style={histogramWrapStyle}>
        {error && <div style={{ color: "#dc2626", fontSize: "12px", padding: "6px 8px" }}>Histogram error: {error}</div>}
        {!error && isLoading && !data && (
          <div style={{ color: "#666666", fontSize: "12px", padding: "6px 8px" }}>Loading histogram...</div>
        )}
        <HistogramChart
          buckets={data?.buckets ?? []}
          selectedRange={selectedRange}
          onTimeRangeSelect={(start, end) => {
            actions.updateFilters({
              isLiveTail: false,
              startTime: start,
              endTime: end,
            });
          }}
        />
      </div>
    </div>
  );
}
