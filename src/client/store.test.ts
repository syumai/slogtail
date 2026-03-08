import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_FILTER_STATE, applyToggleLiveTail } from "./store";

// ---------------------------------------------------------------------------
// DEFAULT_FILTER_STATE - default filter values
// ---------------------------------------------------------------------------

describe("DEFAULT_FILTER_STATE", () => {
  it("has limit set to 1000", () => {
    expect(DEFAULT_FILTER_STATE.limit).toBe(1000);
  });

  it("has startTime set (not undefined)", () => {
    expect(DEFAULT_FILTER_STATE.startTime).toBeDefined();
    expect(DEFAULT_FILTER_STATE.startTime).toBeInstanceOf(Date);
  });

  it("has startTime set to approximately 1 hour ago", () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const startTimeMs = DEFAULT_FILTER_STATE.startTime!.getTime();
    // Allow 5 seconds of tolerance for test execution time
    expect(startTimeMs).toBeGreaterThanOrEqual(oneHourAgo - 5000);
    expect(startTimeMs).toBeLessThanOrEqual(now);
  });
});

// ---------------------------------------------------------------------------
// applyToggleLiveTail - pure state transition for toggleLiveTail
// ---------------------------------------------------------------------------

describe("applyToggleLiveTail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets startTime to 1 hour ago when turning Live Tail ON", () => {
    const prevState = {
      ...DEFAULT_FILTER_STATE,
      isLiveTail: false,
      startTime: new Date("2026-03-01T00:00:00Z"),
      endTime: new Date("2026-03-01T12:00:00Z"),
    };

    const nextState = applyToggleLiveTail(prevState);

    expect(nextState.isLiveTail).toBe(true);
    expect(nextState.startTime).toEqual(new Date("2026-03-09T11:00:00Z"));
  });

  it("sets endTime to undefined when turning Live Tail ON", () => {
    const prevState = {
      ...DEFAULT_FILTER_STATE,
      isLiveTail: false,
      startTime: new Date("2026-03-01T00:00:00Z"),
      endTime: new Date("2026-03-01T12:00:00Z"),
    };

    const nextState = applyToggleLiveTail(prevState);

    expect(nextState.isLiveTail).toBe(true);
    expect(nextState.endTime).toBeUndefined();
  });

  it("does not modify startTime or endTime when turning Live Tail OFF", () => {
    const prevState = {
      ...DEFAULT_FILTER_STATE,
      isLiveTail: true,
      startTime: new Date("2026-03-09T11:00:00Z"),
      endTime: undefined,
    };

    const nextState = applyToggleLiveTail(prevState);

    expect(nextState.isLiveTail).toBe(false);
    expect(nextState.startTime).toEqual(new Date("2026-03-09T11:00:00Z"));
    expect(nextState.endTime).toBeUndefined();
  });

  it("toggles isLiveTail from true to false", () => {
    const prevState = { ...DEFAULT_FILTER_STATE, isLiveTail: true };
    const nextState = applyToggleLiveTail(prevState);
    expect(nextState.isLiveTail).toBe(false);
  });

  it("toggles isLiveTail from false to true", () => {
    const prevState = { ...DEFAULT_FILTER_STATE, isLiveTail: false };
    const nextState = applyToggleLiveTail(prevState);
    expect(nextState.isLiveTail).toBe(true);
  });
});
