import { describe, it, expect } from "vitest";
import {
  formatIngestionRate,
  formatTimeRange,
  shouldPollStats,
  resolveDisplayStats,
} from "./StatsBar";
import type { SerializedLogStats } from "../api";

// ---------------------------------------------------------------------------
// formatIngestionRate - human-readable ingestion rate display
// ---------------------------------------------------------------------------

describe("formatIngestionRate", () => {
  it("returns '0 logs/s' for zero rate", () => {
    expect(formatIngestionRate(0)).toBe("0 logs/s");
  });

  it("formats integer rates without decimals", () => {
    expect(formatIngestionRate(5)).toBe("5 logs/s");
    expect(formatIngestionRate(100)).toBe("100 logs/s");
  });

  it("formats fractional rates with one decimal place", () => {
    expect(formatIngestionRate(3.7)).toBe("3.7 logs/s");
    expect(formatIngestionRate(0.5)).toBe("0.5 logs/s");
  });

  it("rounds to one decimal place", () => {
    expect(formatIngestionRate(3.14159)).toBe("3.1 logs/s");
    expect(formatIngestionRate(99.99)).toBe("100 logs/s");
  });

  it("formats large rates with locale separators", () => {
    // 1234.5 -> "1,234.5 logs/s" (en-US locale)
    const result = formatIngestionRate(1234.5);
    expect(result).toContain("logs/s");
    // Should contain some form of the number with magnitude > 1000
    expect(result).not.toBe("1234.5 logs/s"); // should have locale formatting
  });

  it("drops decimal for whole numbers after rounding", () => {
    expect(formatIngestionRate(10.0)).toBe("10 logs/s");
    expect(formatIngestionRate(42.001)).toBe("42 logs/s");
  });
});

// ---------------------------------------------------------------------------
// formatTimeRange - display time range in readable format
// ---------------------------------------------------------------------------

describe("formatTimeRange", () => {
  it("returns empty string when both min and max are null", () => {
    expect(formatTimeRange(null, null)).toBe("");
  });

  it("formats when only min is provided", () => {
    const result = formatTimeRange("2026-01-15T10:00:00.000Z", null);
    expect(result).toContain("2026");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats when only max is provided", () => {
    const result = formatTimeRange(null, "2026-01-15T18:00:00.000Z");
    expect(result).toContain("2026");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats when both min and max are provided", () => {
    const result = formatTimeRange(
      "2026-01-15T10:00:00.000Z",
      "2026-01-15T18:00:00.000Z",
    );
    expect(result).toContain("2026");
    // Should contain a separator between the two dates
    expect(result).toContain(" - ");
  });

  it("returns a human-readable date format", () => {
    const result = formatTimeRange("2026-06-15T14:30:00.000Z", null);
    // Should contain some recognizable date parts
    expect(result).toMatch(/\d{4}/); // year
  });
});

// ---------------------------------------------------------------------------
// shouldPollStats - polling fallback decision logic (Req 4.4)
// ---------------------------------------------------------------------------

describe("shouldPollStats", () => {
  it("returns true when live tail is on and WebSocket is disconnected", () => {
    expect(shouldPollStats(true, false)).toBe(true);
  });

  it("returns false when live tail is on and WebSocket is connected", () => {
    expect(shouldPollStats(true, true)).toBe(false);
  });

  it("returns false when live tail is off and WebSocket is disconnected", () => {
    expect(shouldPollStats(false, false)).toBe(false);
  });

  it("returns false when live tail is off and WebSocket is connected", () => {
    expect(shouldPollStats(false, true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveDisplayStats - choose between live and API stats (Req 4.3, 4.4)
// ---------------------------------------------------------------------------

describe("resolveDisplayStats", () => {
  const apiStats: SerializedLogStats = {
    total: 100,
    byLevel: { INFO: 80, ERROR: 20 },
    errorRate: 20,
    timeRange: { min: "2026-01-01T00:00:00Z", max: "2026-01-01T12:00:00Z" },
    ingestionRate: 5,
  };

  const liveStats: SerializedLogStats = {
    total: 150,
    byLevel: { INFO: 120, ERROR: 30 },
    errorRate: 20,
    timeRange: { min: "2026-01-01T00:00:00Z", max: "2026-01-01T13:00:00Z" },
    ingestionRate: 10,
  };

  it("returns liveStats when live tail is on and liveStats is available", () => {
    expect(resolveDisplayStats(true, liveStats, apiStats)).toBe(liveStats);
  });

  it("returns apiStats when live tail is on but liveStats is null", () => {
    expect(resolveDisplayStats(true, null, apiStats)).toBe(apiStats);
  });

  it("returns apiStats when live tail is off", () => {
    expect(resolveDisplayStats(false, liveStats, apiStats)).toBe(apiStats);
  });

  it("returns apiStats when live tail is off and liveStats is null", () => {
    expect(resolveDisplayStats(false, null, apiStats)).toBe(apiStats);
  });

  it("returns null when both liveStats and apiStats are null", () => {
    expect(resolveDisplayStats(true, null, null)).toBeNull();
  });

  it("returns null when live tail is off and apiStats is null", () => {
    expect(resolveDisplayStats(false, null, null)).toBeNull();
  });
});
