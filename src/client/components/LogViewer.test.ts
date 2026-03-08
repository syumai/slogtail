import { describe, it, expect } from "vitest";
import type { SerializedLogEntry } from "../api";

// ---------------------------------------------------------------------------
// Helper: create a mock log entry for testing
// ---------------------------------------------------------------------------

function createMockLog(overrides: Partial<SerializedLogEntry> = {}): SerializedLogEntry {
  return {
    _id: "1",
    _ingested: "2026-01-01T00:00:00Z",
    _raw: {},
    timestamp: "2026-01-01T00:00:00Z",
    level: "INFO",
    message: "test message",
    service: "test-service",
    trace_id: null,
    host: "localhost",
    duration_ms: null,
    source: "default",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task 5.1: LogViewer state simplification - REST API response as sole data source
// ---------------------------------------------------------------------------

describe("Task 5.1: resolveDisplayLogs", () => {
  it("returns apiLogs directly without any filtering or merging", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    const apiLogs = [
      createMockLog({ _id: "1", level: "INFO" }),
      createMockLog({ _id: "2", level: "ERROR" }),
      createMockLog({ _id: "3", level: "WARN" }),
    ];

    const result = resolveDisplayLogs(apiLogs);
    expect(result).toBe(apiLogs);
  });

  it("returns apiLogs even when the array is empty", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    const apiLogs: SerializedLogEntry[] = [];
    const result = resolveDisplayLogs(apiLogs);
    expect(result).toBe(apiLogs);
  });

  it("does not perform client-side filtering on log level", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    const apiLogs = [
      createMockLog({ _id: "1", level: "INFO" }),
      createMockLog({ _id: "2", level: "ERROR" }),
    ];

    // Even if the caller wanted only ERROR, resolveDisplayLogs returns all
    const result = resolveDisplayLogs(apiLogs);
    expect(result).toHaveLength(2);
    expect(result[0].level).toBe("INFO");
    expect(result[1].level).toBe("ERROR");
  });

  it("does not merge or deduplicate logs", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    // Even if there are duplicate IDs (shouldn't happen from server), no dedup
    const apiLogs = [
      createMockLog({ _id: "1", message: "first" }),
      createMockLog({ _id: "1", message: "duplicate" }),
    ];

    const result = resolveDisplayLogs(apiLogs);
    expect(result).toHaveLength(2);
    expect(result).toBe(apiLogs);
  });

  it("returns the same array reference (no copy)", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    const apiLogs = [createMockLog({ _id: "1" })];
    const result = resolveDisplayLogs(apiLogs);
    expect(result).toBe(apiLogs);
  });
});

// ---------------------------------------------------------------------------
// Task 5.2: resolveWebSocketOptions - connect onNotify to refetch
// ---------------------------------------------------------------------------

describe("Task 5.2: resolveWebSocketOptions", () => {
  it("returns onNotify set to the provided refetch function", async () => {
    const { resolveWebSocketOptions } = await import("./LogViewer");

    const refetch = () => {};
    const result = resolveWebSocketOptions(refetch, true);

    expect(result.onNotify).toBe(refetch);
  });

  it("passes enabled flag through to the options", async () => {
    const { resolveWebSocketOptions } = await import("./LogViewer");

    const refetch = () => {};

    const enabledResult = resolveWebSocketOptions(refetch, true);
    expect(enabledResult.enabled).toBe(true);

    const disabledResult = resolveWebSocketOptions(refetch, false);
    expect(disabledResult.enabled).toBe(false);
  });

  it("does not include onLogs property", async () => {
    const { resolveWebSocketOptions } = await import("./LogViewer");

    const refetch = () => {};
    const result = resolveWebSocketOptions(refetch, true);

    expect("onLogs" in result).toBe(false);
  });

  it("does not include filter property", async () => {
    const { resolveWebSocketOptions } = await import("./LogViewer");

    const refetch = () => {};
    const result = resolveWebSocketOptions(refetch, true);

    expect("filter" in result).toBe(false);
  });

  it("does not include onStats property", async () => {
    const { resolveWebSocketOptions } = await import("./LogViewer");

    const refetch = () => {};
    const result = resolveWebSocketOptions(refetch, true);

    expect("onStats" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task 5.2: shouldUsePollFallback - polling fallback should be removed
// ---------------------------------------------------------------------------

describe("Task 5.2: polling fallback removal", () => {
  it("shouldUsePollFallback is not exported (polling is removed)", async () => {
    const mod = await import("./LogViewer");
    expect("shouldUsePollFallback" in mod).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task 5.3: resolveToolbarStatus - display status without liveLogs count
// ---------------------------------------------------------------------------

describe("Task 5.3: resolveToolbarStatus", () => {
  it("shows total count for non-live-tail mode", async () => {
    const { resolveToolbarStatus } = await import("./LogViewer");

    const result = resolveToolbarStatus({
      isLiveTail: false,
      isConnected: false,
      total: 42,
    });

    expect(result).toContain("42");
    expect(result).toContain("results");
  });

  it("shows total count for live-tail mode (server-side results)", async () => {
    const { resolveToolbarStatus } = await import("./LogViewer");

    const result = resolveToolbarStatus({
      isLiveTail: true,
      isConnected: true,
      total: 150,
    });

    expect(result).toContain("150");
    expect(result).toContain("results");
  });

  it("shows polling indicator when live tail is on but WS is disconnected", async () => {
    const { resolveToolbarStatus } = await import("./LogViewer");

    const result = resolveToolbarStatus({
      isLiveTail: true,
      isConnected: false,
      total: 100,
    });

    expect(result).toContain("100");
    expect(result).toContain("results");
  });

  it("does not reference liveLogs count (liveLogs state is removed)", async () => {
    const { resolveToolbarStatus } = await import("./LogViewer");

    const result = resolveToolbarStatus({
      isLiveTail: true,
      isConnected: true,
      total: 50,
    });

    // Should not contain "live logs" text that references client-side count
    expect(result).not.toContain("live logs");
  });
});

// ---------------------------------------------------------------------------
// Task 5.3: Flicker prevention - useLogs keeps previous results during loading
// ---------------------------------------------------------------------------

describe("Task 5.3: flicker prevention via stable key and bulk replacement", () => {
  it("resolveDisplayLogs returns the same reference on repeated calls with same input", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    const apiLogs = [createMockLog({ _id: "1" }), createMockLog({ _id: "2" })];

    const result1 = resolveDisplayLogs(apiLogs);
    const result2 = resolveDisplayLogs(apiLogs);

    // Same input array reference should produce same output reference
    expect(result1).toBe(result2);
    expect(result1).toBe(apiLogs);
  });

  it("each log retains its _id for use as React key", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    const apiLogs = [
      createMockLog({ _id: "abc-123" }),
      createMockLog({ _id: "def-456" }),
      createMockLog({ _id: "ghi-789" }),
    ];

    const result = resolveDisplayLogs(apiLogs);
    expect(result[0]._id).toBe("abc-123");
    expect(result[1]._id).toBe("def-456");
    expect(result[2]._id).toBe("ghi-789");
  });

  it("bulk replaces all logs when new results arrive (no partial update)", async () => {
    const { resolveDisplayLogs } = await import("./LogViewer");

    const oldLogs = [
      createMockLog({ _id: "1", message: "old" }),
      createMockLog({ _id: "2", message: "old" }),
    ];

    const newLogs = [
      createMockLog({ _id: "3", message: "new" }),
      createMockLog({ _id: "4", message: "new" }),
      createMockLog({ _id: "5", message: "new" }),
    ];

    const oldResult = resolveDisplayLogs(oldLogs);
    expect(oldResult).toHaveLength(2);

    const newResult = resolveDisplayLogs(newLogs);
    expect(newResult).toHaveLength(3);
    expect(newResult).toBe(newLogs);
    // Complete replacement - no traces of old logs
    expect(newResult.every((log) => log.message === "new")).toBe(true);
  });
});
