import { useState, useCallback, useMemo } from "react";
import { useStats, useWebSocket } from "../api";
import type { SerializedLogStats } from "../api";
import { useFilters } from "../store";
import { LOG_LEVELS } from "../../types";

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Format ingestion rate as a human-readable string.
 * Examples: "0 logs/s", "5 logs/s", "3.7 logs/s", "1,234.5 logs/s"
 */
export function formatIngestionRate(rate: number): string {
  const rounded = Math.round(rate * 10) / 10;
  const isWhole = rounded % 1 === 0;
  const formatted = isWhole
    ? Math.round(rounded).toLocaleString()
    : rounded.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
  return `${formatted} logs/s`;
}

/**
 * Format a time range from serialized ISO strings into a readable display string.
 * Returns empty string when both are null.
 */
export function formatTimeRange(
  min: string | null,
  max: string | null,
): string {
  if (!min && !max) return "";

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  };

  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `${fmt(min)} -`;
  return `- ${fmt(max!)}`;
}

// ---------------------------------------------------------------------------
// Level colors
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "#888888",
  INFO: "#4a9eff",
  WARN: "#ffcc00",
  ERROR: "#ff4444",
  FATAL: "#cc44cc",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "8px 16px",
  backgroundColor: "#16162a",
  borderBottom: "1px solid #2a2a4a",
  fontSize: "13px",
  flexWrap: "wrap",
};

const statGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const levelBadgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "4px",
  backgroundColor: color + "22",
  color: color,
  fontWeight: "bold",
  fontSize: "12px",
});

const barContainerStyle: React.CSSProperties = {
  display: "flex",
  height: "6px",
  flex: 1,
  minWidth: "120px",
  borderRadius: "3px",
  overflow: "hidden",
  backgroundColor: "#0f0f23",
};

const barSegmentStyle = (color: string, widthPercent: number): React.CSSProperties => ({
  width: `${widthPercent}%`,
  backgroundColor: color,
  minWidth: widthPercent > 0 ? "2px" : "0",
  transition: "width 0.3s ease",
});

const errorRateStyle = (rate: number): React.CSSProperties => ({
  color: rate > 10 ? "#ff4444" : rate > 5 ? "#ffcc00" : "#4a9eff",
  fontWeight: "bold",
});

const totalStyle: React.CSSProperties = {
  color: "#a0a0c0",
};

const ingestionRateStyle: React.CSSProperties = {
  color: "#4a9eff",
  fontWeight: "bold",
};

const timeRangeStyle: React.CSSProperties = {
  color: "#6a6a9a",
  fontSize: "12px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatsBar() {
  const [filters] = useFilters();
  const { stats: apiStats, isLoading } = useStats(filters.source.length === 1 ? filters.source[0] : undefined);
  const [liveStats, setLiveStats] = useState<SerializedLogStats | null>(null);

  const handleStats = useCallback((stats: SerializedLogStats) => {
    setLiveStats(stats);
  }, []);

  const wsFilter = useMemo(
    () => ({
      level: filters.level,
      service: filters.service,
      source: filters.source,
    }),
    [filters.level, filters.service, filters.source],
  );

  useWebSocket({
    onStats: handleStats,
    filter: wsFilter,
    enabled: filters.isLiveTail,
  });

  const stats = filters.isLiveTail && liveStats ? liveStats : apiStats;

  if (isLoading && !stats) {
    return (
      <div style={containerStyle}>
        <span style={totalStyle}>Loading stats...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={containerStyle}>
        <span style={totalStyle}>No stats available</span>
      </div>
    );
  }

  const total = stats.total || 1; // avoid division by zero

  return (
    <div style={containerStyle}>
      <span style={totalStyle}>Total: {stats.total.toLocaleString()}</span>

      <div style={statGroupStyle}>
        {LOG_LEVELS.map((level) => {
          const count = stats.byLevel[level] ?? 0;
          if (count === 0) return null;
          return (
            <span key={level} style={levelBadgeStyle(LEVEL_COLORS[level] ?? "#888")}>
              {level} {count.toLocaleString()}
            </span>
          );
        })}
      </div>

      <div style={barContainerStyle}>
        {LOG_LEVELS.map((level) => {
          const count = stats.byLevel[level] ?? 0;
          const percent = (count / total) * 100;
          return (
            <div
              key={level}
              style={barSegmentStyle(LEVEL_COLORS[level] ?? "#888", percent)}
              title={`${level}: ${count}`}
            />
          );
        })}
      </div>

      <span style={errorRateStyle(stats.errorRate)}>
        Error rate: {stats.errorRate.toFixed(1)}%
      </span>

      <span style={ingestionRateStyle}>
        {formatIngestionRate(stats.ingestionRate)}
      </span>

      {formatTimeRange(stats.timeRange.min, stats.timeRange.max) && (
        <span style={timeRangeStyle}>
          {formatTimeRange(stats.timeRange.min, stats.timeRange.max)}
        </span>
      )}
    </div>
  );
}
