import type { Ingester } from "./ingester";

// ---------------------------------------------------------------------------
// WSHandler class
// ---------------------------------------------------------------------------

/** Minimal interface for objects that behave like WSContext */
interface WSLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}

const NOTIFY_MESSAGE = JSON.stringify({ type: "notify" as const });

/**
 * Manages WebSocket client connections.
 * Subscribes to Ingester "batch" events and broadcasts a notify message
 * to all connected clients when new logs arrive.
 * Clients are expected to fetch logs via REST API upon notification.
 */
export class WSHandler {
  private clients: Set<WSLike> = new Set();

  /** Number of currently connected clients */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * No-op. Previously used to set the LogDatabase for stats retrieval.
   * Retained for backward compatibility with callers; will be removed
   * when cli/index.ts and dev-init.ts are updated.
   * @deprecated No longer needed; broadcast sends notify-only messages.
   */
  setDatabase(_db: unknown): void {
    // intentionally empty
  }

  /**
   * Subscribe to an Ingester's "batch" event.
   * When a batch is ingested, broadcasts a notify message to all clients.
   */
  subscribe(ingester: Ingester): void {
    ingester.on("batch", () => {
      this.broadcast();
    });
  }

  /**
   * Handle a new WebSocket connection.
   * Registers the client.
   */
  handleConnection(ws: WSLike): void {
    this.clients.add(ws);
  }

  /**
   * Handle a message from a WebSocket client.
   * All messages are ignored (filter messages are no longer processed).
   */
  handleMessage(_ws: WSLike, _message: string): void {
    // All client messages are ignored.
    // Filter processing has been removed; filtering is done server-side via REST API.
  }

  /**
   * Handle WebSocket connection close.
   * Removes the client from the registry.
   */
  handleClose(ws: WSLike): void {
    this.clients.delete(ws);
  }

  /**
   * Broadcast a notify message to all connected clients.
   * Sends { type: "notify" } to inform clients that new logs are available.
   * Clients should fetch updated data via REST API.
   */
  broadcast(): void {
    for (const ws of this.clients) {
      // Skip clients that are not in OPEN state
      if (ws.readyState !== 1) continue;
      ws.send(NOTIFY_MESSAGE);
    }
  }
}
