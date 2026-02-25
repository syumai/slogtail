import { describe, it, expect, beforeEach, vi } from "vitest";
import { WSHandler, matchesFilter } from "./ws";
import type { NormalizedLog, LogStats } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNormalizedLog(overrides: Partial<NormalizedLog> = {}): NormalizedLog {
  return {
    _id: 1n,
    _ingested: new Date("2026-01-15T10:00:00Z"),
    _raw: JSON.stringify({ message: "test" }),
    timestamp: new Date("2026-01-15T10:00:00Z"),
    level: "INFO",
    message: "test message",
    service: "api",
    trace_id: null,
    host: "localhost",
    duration_ms: null,
    source: "default",
    ...overrides,
  };
}

function makeStats(overrides: Partial<LogStats> = {}): LogStats {
  return {
    total: 10,
    byLevel: { INFO: 5, ERROR: 3, WARN: 2 },
    errorRate: 0.3,
    timeRange: { min: new Date("2026-01-15T10:00:00Z"), max: new Date("2026-01-15T10:05:00Z") },
    ingestionRate: 0,
    ...overrides,
  };
}

/**
 * Create a mock WSContext-like object with send/close tracking.
 * Since real WSContext requires a complex init, we mock the essential methods.
 */
function createMockWS() {
  const sent: string[] = [];
  return {
    send: vi.fn((data: string) => {
      sent.push(data);
    }),
    close: vi.fn(),
    readyState: 1 as const, // OPEN
    sent,
  };
}

// ---------------------------------------------------------------------------
// matchesFilter - pure function tests
// ---------------------------------------------------------------------------

describe("matchesFilter", () => {
  it("returns true when filter is empty (no criteria)", () => {
    const log = makeNormalizedLog({ level: "ERROR", service: "api", source: "proc-1" });
    expect(matchesFilter(log, {})).toBe(true);
  });

  it("matches by single level", () => {
    const log = makeNormalizedLog({ level: "ERROR" });
    expect(matchesFilter(log, { level: ["ERROR"] })).toBe(true);
    expect(matchesFilter(log, { level: ["INFO"] })).toBe(false);
  });

  it("matches by multiple levels (OR)", () => {
    const log = makeNormalizedLog({ level: "WARN" });
    expect(matchesFilter(log, { level: ["ERROR", "WARN"] })).toBe(true);
    expect(matchesFilter(log, { level: ["ERROR", "FATAL"] })).toBe(false);
  });

  it("matches by single service", () => {
    const log = makeNormalizedLog({ service: "api" });
    expect(matchesFilter(log, { service: ["api"] })).toBe(true);
    expect(matchesFilter(log, { service: ["worker"] })).toBe(false);
  });

  it("matches by multiple services (OR)", () => {
    const log = makeNormalizedLog({ service: "api" });
    expect(matchesFilter(log, { service: ["api", "worker"] })).toBe(true);
    expect(matchesFilter(log, { service: ["worker", "scheduler"] })).toBe(false);
  });

  it("matches by single source", () => {
    const log = makeNormalizedLog({ source: "proc-1" });
    expect(matchesFilter(log, { source: ["proc-1"] })).toBe(true);
    expect(matchesFilter(log, { source: ["proc-2"] })).toBe(false);
  });

  it("matches by multiple sources (OR)", () => {
    const log = makeNormalizedLog({ source: "proc-1" });
    expect(matchesFilter(log, { source: ["proc-1", "proc-2"] })).toBe(true);
    expect(matchesFilter(log, { source: ["proc-2", "proc-3"] })).toBe(false);
  });

  it("matches with combined filters (AND logic between categories)", () => {
    const log = makeNormalizedLog({ level: "ERROR", service: "api", source: "proc-1" });
    expect(matchesFilter(log, { level: ["ERROR"], service: ["api"], source: ["proc-1"] })).toBe(true);
    expect(matchesFilter(log, { level: ["ERROR"], service: ["worker"] })).toBe(false);
    expect(matchesFilter(log, { level: ["INFO"], service: ["api"] })).toBe(false);
  });

  it("matches with OR within category and AND between categories", () => {
    const log = makeNormalizedLog({ level: "ERROR", service: "api" });
    expect(matchesFilter(log, { level: ["ERROR", "WARN"], service: ["api", "worker"] })).toBe(true);
    expect(matchesFilter(log, { level: ["INFO", "WARN"], service: ["api", "worker"] })).toBe(false);
  });

  it("matches when log field is null and filter is set", () => {
    const log = makeNormalizedLog({ level: null });
    expect(matchesFilter(log, { level: ["ERROR"] })).toBe(false);
  });

  it("matches when log field is null and filter is not set for that field", () => {
    const log = makeNormalizedLog({ level: null });
    expect(matchesFilter(log, { service: ["api"] })).toBe(true);
  });

  it("ignores empty arrays (matches everything)", () => {
    const log = makeNormalizedLog({ level: "ERROR" });
    expect(matchesFilter(log, { level: [] })).toBe(true);
    expect(matchesFilter(log, { service: [] })).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case-insensitive level matching (Requirement 3.1 / Task 1.3)
  // -------------------------------------------------------------------------

  it("matches level case-insensitively: lowercase log level vs uppercase filter", () => {
    const log = makeNormalizedLog({ level: "error" });
    expect(matchesFilter(log, { level: ["ERROR"] })).toBe(true);
  });

  it("matches level case-insensitively: uppercase log level vs lowercase filter", () => {
    const log = makeNormalizedLog({ level: "ERROR" });
    expect(matchesFilter(log, { level: ["error" as never] })).toBe(true);
  });

  it("matches level case-insensitively: mixed case log level vs uppercase filter", () => {
    const log = makeNormalizedLog({ level: "Error" });
    expect(matchesFilter(log, { level: ["ERROR"] })).toBe(true);
  });

  it("matches level case-insensitively: mixed case in both log and filter", () => {
    const log = makeNormalizedLog({ level: "Warn" });
    expect(matchesFilter(log, { level: ["warn" as never, "error" as never] })).toBe(true);
  });

  it("does not match level case-insensitively when level is different", () => {
    const log = makeNormalizedLog({ level: "info" });
    expect(matchesFilter(log, { level: ["ERROR", "WARN"] })).toBe(false);
  });

  it("handles null log level with case-insensitive filter", () => {
    const log = makeNormalizedLog({ level: null });
    expect(matchesFilter(log, { level: ["ERROR"] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WSHandler - client management
// ---------------------------------------------------------------------------

describe("WSHandler", () => {
  let handler: WSHandler;

  beforeEach(() => {
    handler = new WSHandler();
  });

  describe("client management", () => {
    it("starts with no clients", () => {
      expect(handler.clientCount).toBe(0);
    });

    it("registers a client on handleConnection", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);
      expect(handler.clientCount).toBe(1);
    });

    it("registers multiple clients", () => {
      const ws1 = createMockWS();
      const ws2 = createMockWS();
      handler.handleConnection(ws1 as any);
      handler.handleConnection(ws2 as any);
      expect(handler.clientCount).toBe(2);
    });

    it("removes a client on handleClose", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);
      expect(handler.clientCount).toBe(1);
      handler.handleClose(ws as any);
      expect(handler.clientCount).toBe(0);
    });

    it("handles closing a non-registered client gracefully", () => {
      const ws = createMockWS();
      // Should not throw
      handler.handleClose(ws as any);
      expect(handler.clientCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // handleMessage - filter update
  // ---------------------------------------------------------------------------

  describe("handleMessage", () => {
    it("updates client filter on valid filter message with arrays", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { level: ["ERROR"], service: ["api"] },
      }));

      expect(handler.getClientFilter(ws as any)).toEqual({
        level: ["ERROR"],
        service: ["api"],
      });
    });

    it("wraps single string values in arrays for backward compat", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { level: "ERROR", service: "api" },
      }));

      expect(handler.getClientFilter(ws as any)).toEqual({
        level: ["ERROR"],
        service: ["api"],
      });
    });

    it("updates client filter with source array", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { source: ["proc-1", "proc-2"] },
      }));

      expect(handler.getClientFilter(ws as any)).toEqual({
        source: ["proc-1", "proc-2"],
      });
    });

    it("replaces previous filter on re-filter", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { level: ["ERROR"] },
      }));
      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { service: ["worker"] },
      }));

      expect(handler.getClientFilter(ws as any)).toEqual({
        service: ["worker"],
      });
    });

    it("ignores invalid JSON messages", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      // Should not throw
      handler.handleMessage(ws as any, "not valid json{{{");
      expect(handler.getClientFilter(ws as any)).toEqual({});
    });

    it("ignores messages with unknown type", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "unknown",
        data: "something",
      }));
      expect(handler.getClientFilter(ws as any)).toEqual({});
    });

    it("ignores messages without type field", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({ foo: "bar" }));
      expect(handler.getClientFilter(ws as any)).toEqual({});
    });

    it("ignores filter messages with invalid filter shape", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: "not-an-object",
      }));
      expect(handler.getClientFilter(ws as any)).toEqual({});
    });

    it("ignores messages for unregistered clients", () => {
      const ws = createMockWS();
      // Not calling handleConnection, so the client is not registered
      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { level: ["ERROR"] },
      }));
      expect(handler.clientCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // broadcast - filtered log delivery
  // ---------------------------------------------------------------------------

  describe("broadcast", () => {
    it("sends logs to all clients when no filters are set", () => {
      const ws1 = createMockWS();
      const ws2 = createMockWS();
      handler.handleConnection(ws1 as any);
      handler.handleConnection(ws2 as any);

      const logs = [makeNormalizedLog({ _id: 1n })];
      const stats = makeStats();

      handler.broadcast(logs, stats);

      // Both should receive logs and stats messages
      expect(ws1.send).toHaveBeenCalledTimes(2); // logs + stats
      expect(ws2.send).toHaveBeenCalledTimes(2);
    });

    it("sends only matching logs to filtered clients", () => {
      const ws1 = createMockWS();
      const ws2 = createMockWS();
      handler.handleConnection(ws1 as any);
      handler.handleConnection(ws2 as any);

      // ws1 filters for ERROR only
      handler.handleMessage(ws1 as any, JSON.stringify({
        type: "filter",
        filter: { level: ["ERROR"] },
      }));

      const logs = [
        makeNormalizedLog({ _id: 1n, level: "INFO" }),
        makeNormalizedLog({ _id: 2n, level: "ERROR" }),
        makeNormalizedLog({ _id: 3n, level: "WARN" }),
      ];
      const stats = makeStats();

      handler.broadcast(logs, stats);

      // ws1: should receive only 1 matching log + stats
      const ws1Messages = ws1.sent.map((s) => JSON.parse(s));
      const ws1LogsMsg = ws1Messages.find((m: any) => m.type === "logs");
      expect(ws1LogsMsg.data).toHaveLength(1);
      expect(ws1LogsMsg.data[0]._id).toBe("2"); // _id serialized as string

      // ws2: should receive all 3 logs + stats (no filter)
      const ws2Messages = ws2.sent.map((s) => JSON.parse(s));
      const ws2LogsMsg = ws2Messages.find((m: any) => m.type === "logs");
      expect(ws2LogsMsg.data).toHaveLength(3);
    });

    it("sends matching logs with OR filter within same category", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      // Filter for ERROR OR WARN
      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { level: ["ERROR", "WARN"] },
      }));

      const logs = [
        makeNormalizedLog({ _id: 1n, level: "INFO" }),
        makeNormalizedLog({ _id: 2n, level: "ERROR" }),
        makeNormalizedLog({ _id: 3n, level: "WARN" }),
        makeNormalizedLog({ _id: 4n, level: "DEBUG" }),
      ];
      const stats = makeStats();

      handler.broadcast(logs, stats);

      const messages = ws.sent.map((s) => JSON.parse(s));
      const logsMsg = messages.find((m: any) => m.type === "logs");
      expect(logsMsg.data).toHaveLength(2);
      expect(logsMsg.data[0]._id).toBe("2");
      expect(logsMsg.data[1]._id).toBe("3");
    });

    it("sends stats to all clients regardless of filter", () => {
      const ws1 = createMockWS();
      handler.handleConnection(ws1 as any);
      handler.handleMessage(ws1 as any, JSON.stringify({
        type: "filter",
        filter: { level: ["FATAL"] },
      }));

      // No logs match FATAL, but stats should still be sent
      const logs = [makeNormalizedLog({ _id: 1n, level: "INFO" })];
      const stats = makeStats();

      handler.broadcast(logs, stats);

      const messages = ws1.sent.map((s) => JSON.parse(s));
      // No logs message should be sent when there are 0 matching logs
      const logsMsg = messages.find((m: any) => m.type === "logs");
      expect(logsMsg).toBeUndefined();

      // Stats should always be sent
      const statsMsg = messages.find((m: any) => m.type === "stats");
      expect(statsMsg).toBeDefined();
      expect(statsMsg.data.total).toBe(10);
    });

    it("does not send logs message when no logs match the filter", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);
      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { level: ["FATAL"] },
      }));

      const logs = [makeNormalizedLog({ _id: 1n, level: "INFO" })];
      const stats = makeStats();

      handler.broadcast(logs, stats);

      const messages = ws.sent.map((s) => JSON.parse(s));
      const logsMsg = messages.find((m: any) => m.type === "logs");
      expect(logsMsg).toBeUndefined();
    });

    it("filters by source", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);
      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { source: ["proc-1"] },
      }));

      const logs = [
        makeNormalizedLog({ _id: 1n, source: "proc-1" }),
        makeNormalizedLog({ _id: 2n, source: "proc-2" }),
        makeNormalizedLog({ _id: 3n, source: "proc-1" }),
      ];
      const stats = makeStats();

      handler.broadcast(logs, stats);

      const messages = ws.sent.map((s) => JSON.parse(s));
      const logsMsg = messages.find((m: any) => m.type === "logs");
      expect(logsMsg.data).toHaveLength(2);
    });

    it("does not send to disconnected clients (readyState != 1)", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      // Simulate disconnection by changing readyState
      (ws as any).readyState = 3; // CLOSED

      const logs = [makeNormalizedLog({ _id: 1n })];
      const stats = makeStats();

      handler.broadcast(logs, stats);

      expect(ws.send).not.toHaveBeenCalled();
    });

    it("includes ingestionRate in stats broadcast", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      const logs = [makeNormalizedLog({ _id: 1n })];
      const stats = makeStats({ ingestionRate: 42.5 });

      handler.broadcast(logs, stats);

      const messages = ws.sent.map((s) => JSON.parse(s));
      const statsMsg = messages.find((m: any) => m.type === "stats");
      expect(statsMsg).toBeDefined();
      expect(typeof statsMsg.data.ingestionRate).toBe("number");
      expect(statsMsg.data.ingestionRate).toBe(42.5);
    });

    it("includes ingestionRate of 0 in stats broadcast when rate is zero", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      const logs = [makeNormalizedLog({ _id: 1n })];
      const stats = makeStats({ ingestionRate: 0 });

      handler.broadcast(logs, stats);

      const messages = ws.sent.map((s) => JSON.parse(s));
      const statsMsg = messages.find((m: any) => m.type === "stats");
      expect(statsMsg).toBeDefined();
      expect(statsMsg.data.ingestionRate).toBe(0);
    });

    it("serializes log entries correctly in broadcast", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      const log = makeNormalizedLog({
        _id: 42n,
        _ingested: new Date("2026-01-15T10:00:00Z"),
        _raw: JSON.stringify({ level: "INFO", message: "test" }),
        timestamp: new Date("2026-01-15T10:00:00Z"),
        level: "INFO",
        message: "test message",
        service: "api",
        source: "default",
      });
      const stats = makeStats();

      handler.broadcast([log], stats);

      const messages = ws.sent.map((s) => JSON.parse(s));
      const logsMsg = messages.find((m: any) => m.type === "logs");
      expect(logsMsg).toBeDefined();
      expect(logsMsg.data[0]._id).toBe("42"); // bigint serialized as string
      expect(logsMsg.data[0]._ingested).toBe("2026-01-15T10:00:00.000Z");
      expect(logsMsg.data[0]._raw).toEqual({ level: "INFO", message: "test" });
      expect(logsMsg.data[0].timestamp).toBe("2026-01-15T10:00:00.000Z");
    });
  });

  // ---------------------------------------------------------------------------
  // subscribe - Ingester integration
  // ---------------------------------------------------------------------------

  describe("subscribe", () => {
    it("subscribes to ingester batch events", () => {
      const mockIngester = {
        on: vi.fn(),
      };
      handler.subscribe(mockIngester as any);
      expect(mockIngester.on).toHaveBeenCalledWith("batch", expect.any(Function));
    });
  });
});
