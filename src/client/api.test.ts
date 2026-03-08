import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  UseWebSocketOptions,
  WSNotifyMessage,
} from "./api";

// ---------------------------------------------------------------------------
// useWebSocket interface tests
// ---------------------------------------------------------------------------

describe("useWebSocket", () => {
  describe("UseWebSocketOptions interface", () => {
    it("accepts onNotify callback instead of onLogs/onStats", async () => {
      const { useWebSocket } = await import("./api");

      // This should compile without error - onNotify is the new interface
      const options: UseWebSocketOptions = {
        onNotify: vi.fn(),
        enabled: true,
      };

      expect(options.onNotify).toBeDefined();
      expect(options.enabled).toBe(true);
    });

    it("does not accept onLogs in options type", async () => {
      // Type-level check: onLogs should not exist on UseWebSocketOptions
      const options: UseWebSocketOptions = {
        onNotify: vi.fn(),
      };

      // @ts-expect-error onLogs should not exist on UseWebSocketOptions
      expect(options.onLogs).toBeUndefined();
    });

    it("does not accept onStats in options type", async () => {
      const options: UseWebSocketOptions = {
        onNotify: vi.fn(),
      };

      // @ts-expect-error onStats should not exist on UseWebSocketOptions
      expect(options.onStats).toBeUndefined();
    });

    it("does not accept filter in options type", async () => {
      const options: UseWebSocketOptions = {
        onNotify: vi.fn(),
      };

      // @ts-expect-error filter should not exist on UseWebSocketOptions
      expect(options.filter).toBeUndefined();
    });

    it("accepts debounceMs option with default of 100", async () => {
      const options: UseWebSocketOptions = {
        onNotify: vi.fn(),
        debounceMs: 200,
      };

      expect(options.debounceMs).toBe(200);
    });

    it("allows debounceMs to be optional", async () => {
      const options: UseWebSocketOptions = {
        onNotify: vi.fn(),
      };

      expect(options.debounceMs).toBeUndefined();
    });
  });

  describe("WSNotifyMessage type", () => {
    it("has type 'notify' and no data field", async () => {
      const msg: WSNotifyMessage = { type: "notify" };
      expect(msg.type).toBe("notify");
      expect(Object.keys(msg)).toEqual(["type"]);
    });
  });

  describe("deprecated types are removed", () => {
    it("does not export WSLogMessage", async () => {
      const apiModule = await import("./api");
      // WSLogMessage should no longer be exported
      expect("WSLogMessage" in apiModule).toBe(false);
    });

    it("does not export WSStatsMessage", async () => {
      const apiModule = await import("./api");
      // WSStatsMessage should no longer be exported
      expect("WSStatsMessage" in apiModule).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Debounce behavior tests (pure function)
// ---------------------------------------------------------------------------

describe("createDebouncedNotify", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the callback after the debounce delay", async () => {
    const { createDebouncedNotify } = await import("./api");
    const callback = vi.fn();
    const { trigger, cancel } = createDebouncedNotify(callback, 100);

    trigger();

    // Callback should not be called immediately
    expect(callback).not.toHaveBeenCalled();

    // Advance time by 100ms
    vi.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("coalesces multiple triggers within the debounce window into one call", async () => {
    const { createDebouncedNotify } = await import("./api");
    const callback = vi.fn();
    const { trigger, cancel } = createDebouncedNotify(callback, 100);

    // Trigger 5 times rapidly
    trigger();
    trigger();
    trigger();
    trigger();
    trigger();

    // Advance time past debounce
    vi.advanceTimersByTime(100);

    // Should only be called once
    expect(callback).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("resets the timer on each trigger (trailing debounce)", async () => {
    const { createDebouncedNotify } = await import("./api");
    const callback = vi.fn();
    const { trigger, cancel } = createDebouncedNotify(callback, 100);

    trigger();
    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();

    // Trigger again - should reset the timer
    trigger();
    vi.advanceTimersByTime(50);
    // Still should not have been called (only 50ms since last trigger)
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    // Now 100ms since last trigger
    expect(callback).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("uses 100ms as the default debounce delay", async () => {
    const { createDebouncedNotify } = await import("./api");
    const callback = vi.fn();
    const { trigger, cancel } = createDebouncedNotify(callback);

    trigger();

    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("can be cancelled to prevent pending callback execution", async () => {
    const { createDebouncedNotify } = await import("./api");
    const callback = vi.fn();
    const { trigger, cancel } = createDebouncedNotify(callback, 100);

    trigger();
    vi.advanceTimersByTime(50);

    cancel();

    vi.advanceTimersByTime(100);
    expect(callback).not.toHaveBeenCalled();
  });

  it("allows multiple independent debounce cycles", async () => {
    const { createDebouncedNotify } = await import("./api");
    const callback = vi.fn();
    const { trigger, cancel } = createDebouncedNotify(callback, 100);

    // First cycle
    trigger();
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);

    // Second cycle
    trigger();
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(2);
    cancel();
  });
});

// ---------------------------------------------------------------------------
// useWebSocket function export tests
// ---------------------------------------------------------------------------

describe("useWebSocket export", () => {
  it("is exported as a function", async () => {
    const { useWebSocket } = await import("./api");
    expect(typeof useWebSocket).toBe("function");
  });
});
