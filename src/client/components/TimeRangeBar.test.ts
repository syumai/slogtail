import { describe, expect, it } from "vitest";
import { formatDatetimeLocal, inferTimePreset, parseDatetimeLocal } from "./TimeRangeBar";
import type { FilterState } from "../store";

function makeFilterState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    level: [],
    service: [],
    host: [],
    source: [],
    limit: 200,
    offset: 0,
    order: "desc",
    isLiveTail: true,
    jsonFilters: {},
    ...overrides,
  };
}

describe("inferTimePreset", () => {
  it("returns live when live tail is enabled and no explicit range exists", () => {
    const preset = inferTimePreset(makeFilterState({ isLiveTail: true }));
    expect(preset).toBe("live");
  });

  it("returns known preset for a 1h range", () => {
    const end = new Date("2026-01-01T01:00:00Z");
    const start = new Date("2026-01-01T00:00:00Z");
    const preset = inferTimePreset(
      makeFilterState({ isLiveTail: false, startTime: start, endTime: end }),
    );
    expect(preset).toBe("1h");
  });

  it("returns custom for unmatched duration", () => {
    const end = new Date("2026-01-01T01:10:00Z");
    const start = new Date("2026-01-01T00:00:00Z");
    const preset = inferTimePreset(
      makeFilterState({ isLiveTail: false, startTime: start, endTime: end }),
    );
    expect(preset).toBe("custom");
  });
});

describe("datetime local helpers", () => {
  it("formats undefined as empty string", () => {
    expect(formatDatetimeLocal(undefined)).toBe("");
  });

  it("parses valid local datetime strings", () => {
    const parsed = parseDatetimeLocal("2026-03-10T12:45");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
  });

  it("returns undefined for invalid datetime strings", () => {
    expect(parseDatetimeLocal("invalid")).toBeUndefined();
  });
});
