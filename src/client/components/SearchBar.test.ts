import { describe, it, expect, vi } from "vitest";
import {
  buildFilterTags,
  isValidTimeRange,
  formatDatetimeLocal,
  parseDatetimeLocal,
  type FilterTag,
} from "./SearchBar";
import type { FilterState } from "../store";

// ---------------------------------------------------------------------------
// Helper to build a minimal FilterState
// ---------------------------------------------------------------------------

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

function makeActions() {
  return {
    setLevel: vi.fn(),
    setService: vi.fn(),
    setHost: vi.fn(),
    setSource: vi.fn(),
    setSearch: vi.fn(),
    setTimeRange: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// buildFilterTags - time range tag tests
// ---------------------------------------------------------------------------

describe("buildFilterTags", () => {
  it("returns empty array when no filters are set", () => {
    const tags = buildFilterTags(makeFilterState(), makeActions());
    expect(tags).toEqual([]);
  });

  it("includes a time tag when startTime is set", () => {
    const filters = makeFilterState({
      startTime: new Date("2026-01-15T10:00:00Z"),
    });
    const tags = buildFilterTags(filters, makeActions());
    const timeTag = tags.find((t: FilterTag) => t.key === "time");
    expect(timeTag).toBeDefined();
    expect(timeTag!.label).toContain("2026-01-15T10:00:00");
    expect(timeTag!.label).toContain("*");
  });

  it("includes a time tag when endTime is set", () => {
    const filters = makeFilterState({
      endTime: new Date("2026-01-15T18:00:00Z"),
    });
    const tags = buildFilterTags(filters, makeActions());
    const timeTag = tags.find((t: FilterTag) => t.key === "time");
    expect(timeTag).toBeDefined();
    expect(timeTag!.label).toContain("*");
    expect(timeTag!.label).toContain("2026-01-15T18:00:00");
  });

  it("includes a time tag with both start and end when both are set", () => {
    const filters = makeFilterState({
      startTime: new Date("2026-01-15T10:00:00Z"),
      endTime: new Date("2026-01-15T18:00:00Z"),
    });
    const tags = buildFilterTags(filters, makeActions());
    const timeTag = tags.find((t: FilterTag) => t.key === "time");
    expect(timeTag).toBeDefined();
    expect(timeTag!.label).toContain("2026-01-15T10:00:00");
    expect(timeTag!.label).toContain("2026-01-15T18:00:00");
    expect(timeTag!.label).not.toContain("*");
  });

  it("calls setTimeRange(undefined, undefined) when time tag is removed", () => {
    const actions = makeActions();
    const filters = makeFilterState({
      startTime: new Date("2026-01-15T10:00:00Z"),
      endTime: new Date("2026-01-15T18:00:00Z"),
    });
    const tags = buildFilterTags(filters, actions);
    const timeTag = tags.find((t: FilterTag) => t.key === "time");
    expect(timeTag).toBeDefined();
    timeTag!.onRemove();
    expect(actions.setTimeRange).toHaveBeenCalledWith(undefined, undefined);
  });

  it("does not include time tag when neither startTime nor endTime is set", () => {
    const tags = buildFilterTags(makeFilterState(), makeActions());
    const timeTag = tags.find((t: FilterTag) => t.key === "time");
    expect(timeTag).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isValidTimeRange
// ---------------------------------------------------------------------------

describe("isValidTimeRange", () => {
  it("returns true when both start and end are undefined", () => {
    expect(isValidTimeRange(undefined, undefined)).toBe(true);
  });

  it("returns true when only startTime is set", () => {
    expect(isValidTimeRange(new Date("2026-01-01"), undefined)).toBe(true);
  });

  it("returns true when only endTime is set", () => {
    expect(isValidTimeRange(undefined, new Date("2026-01-01"))).toBe(true);
  });

  it("returns true when startTime < endTime", () => {
    expect(
      isValidTimeRange(
        new Date("2026-01-01T00:00:00"),
        new Date("2026-01-02T00:00:00"),
      ),
    ).toBe(true);
  });

  it("returns true when startTime equals endTime", () => {
    const d = new Date("2026-01-01T12:00:00");
    expect(isValidTimeRange(d, d)).toBe(true);
  });

  it("returns false when startTime > endTime", () => {
    expect(
      isValidTimeRange(
        new Date("2026-01-02T00:00:00"),
        new Date("2026-01-01T00:00:00"),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatDatetimeLocal - converts Date to "YYYY-MM-DDTHH:mm" for <input>
// ---------------------------------------------------------------------------

describe("formatDatetimeLocal", () => {
  it("returns empty string for undefined", () => {
    expect(formatDatetimeLocal(undefined)).toBe("");
  });

  it("formats a Date object to datetime-local string", () => {
    // datetime-local format should be "YYYY-MM-DDTHH:mm"
    const d = new Date("2026-06-15T14:30:00");
    const result = formatDatetimeLocal(d);
    // The result should match the local time representation
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// parseDatetimeLocal - converts "YYYY-MM-DDTHH:mm" string to Date or undefined
// ---------------------------------------------------------------------------

describe("parseDatetimeLocal", () => {
  it("returns undefined for empty string", () => {
    expect(parseDatetimeLocal("")).toBeUndefined();
  });

  it("parses a valid datetime-local string to Date", () => {
    const result = parseDatetimeLocal("2026-06-15T14:30");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(5); // June = month index 5
    expect(result!.getDate()).toBe(15);
    expect(result!.getHours()).toBe(14);
    expect(result!.getMinutes()).toBe(30);
  });

  it("returns undefined for invalid date string", () => {
    expect(parseDatetimeLocal("not-a-date")).toBeUndefined();
  });
});
