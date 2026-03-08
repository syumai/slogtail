import { describe, it, expect, beforeEach, vi } from "vitest";
import { WSHandler } from "./ws";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

    it("tracks clients in a Set (no per-client filter state)", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);
      // After the refactor, there should be no getClientFilter method
      // The handler simply tracks connected clients without filter state
      expect(handler.clientCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // handleMessage - simplified (all messages are ignored)
  // ---------------------------------------------------------------------------

  describe("handleMessage", () => {
    it("ignores filter messages (no filter state is stored)", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "filter",
        filter: { level: ["ERROR"], service: ["api"] },
      }));

      // No error thrown, client is still registered, but no filter is stored
      expect(handler.clientCount).toBe(1);
    });

    it("ignores invalid JSON messages without throwing", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      // Should not throw
      handler.handleMessage(ws as any, "not valid json{{{");
      expect(handler.clientCount).toBe(1);
    });

    it("ignores messages with unknown type", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.handleMessage(ws as any, JSON.stringify({
        type: "unknown",
        data: "something",
      }));
      expect(handler.clientCount).toBe(1);
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
  // broadcast - notify-only delivery
  // ---------------------------------------------------------------------------

  describe("broadcast", () => {
    it("sends { type: 'notify' } to all connected clients", () => {
      const ws1 = createMockWS();
      const ws2 = createMockWS();
      handler.handleConnection(ws1 as any);
      handler.handleConnection(ws2 as any);

      handler.broadcast();

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);

      const msg1 = JSON.parse(ws1.sent[0]);
      const msg2 = JSON.parse(ws2.sent[0]);
      expect(msg1).toEqual({ type: "notify" });
      expect(msg2).toEqual({ type: "notify" });
    });

    it("sends exactly one message per client per broadcast call", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.broadcast();

      expect(ws.send).toHaveBeenCalledTimes(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg).toEqual({ type: "notify" });
    });

    it("does not send any log data in the broadcast message", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.broadcast();

      const msg = JSON.parse(ws.sent[0]);
      expect(msg.type).toBe("notify");
      expect(msg.data).toBeUndefined();
    });

    it("does not send stats in the broadcast message", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      handler.broadcast();

      const messages = ws.sent.map((s) => JSON.parse(s));
      const statsMsg = messages.find((m: any) => m.type === "stats");
      expect(statsMsg).toBeUndefined();
    });

    it("does not send to disconnected clients (readyState != 1)", () => {
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      // Simulate disconnection by changing readyState
      (ws as any).readyState = 3; // CLOSED

      handler.broadcast();

      expect(ws.send).not.toHaveBeenCalled();
    });

    it("sends to open clients but skips closed clients", () => {
      const wsOpen = createMockWS();
      const wsClosed = createMockWS();
      handler.handleConnection(wsOpen as any);
      handler.handleConnection(wsClosed as any);

      (wsClosed as any).readyState = 3; // CLOSED

      handler.broadcast();

      expect(wsOpen.send).toHaveBeenCalledTimes(1);
      expect(wsClosed.send).not.toHaveBeenCalled();
    });

    it("sends nothing when there are no clients", () => {
      // No clients registered - should not throw
      handler.broadcast();
      // No assertions needed beyond not throwing
    });

    it("broadcast takes no arguments (no logs or stats parameters)", () => {
      // Verify broadcast() can be called with no arguments
      const ws = createMockWS();
      handler.handleConnection(ws as any);

      // This should work without any arguments
      handler.broadcast();

      expect(ws.send).toHaveBeenCalledTimes(1);
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

    it("calls broadcast (notify) when ingester emits batch event", () => {
      let batchCallback: Function;
      const mockIngester = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === "batch") {
            batchCallback = cb;
          }
        }),
      };

      const ws = createMockWS();
      handler.handleConnection(ws as any);
      handler.subscribe(mockIngester as any);

      // Simulate a batch event
      batchCallback!();

      expect(ws.send).toHaveBeenCalledTimes(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg).toEqual({ type: "notify" });
    });

    it("does not require database for broadcast (no stats retrieval)", () => {
      let batchCallback: Function;
      const mockIngester = {
        on: vi.fn((event: string, cb: Function) => {
          if (event === "batch") {
            batchCallback = cb;
          }
        }),
      };

      // No setDatabase call
      const ws = createMockWS();
      handler.handleConnection(ws as any);
      handler.subscribe(mockIngester as any);

      // Should still broadcast notify without database
      batchCallback!();

      expect(ws.send).toHaveBeenCalledTimes(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg).toEqual({ type: "notify" });
    });
  });

  // ---------------------------------------------------------------------------
  // matchesFilter should not be exported
  // ---------------------------------------------------------------------------

  describe("removed exports", () => {
    it("does not export matchesFilter", async () => {
      const wsModule = await import("./ws");
      expect((wsModule as any).matchesFilter).toBeUndefined();
    });

    it("does not have getClientFilter method on WSHandler", () => {
      expect((handler as any).getClientFilter).toBeUndefined();
    });
  });
});
