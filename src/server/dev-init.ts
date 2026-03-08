import { LogDatabase } from "./db";
import { Ingester } from "./ingester";
import { WSHandler } from "./ws";

// Persist DB, Ingester, and WSHandler across Vite HMR reloads
declare global {
  // eslint-disable-next-line no-var
  var __slogtail_dev:
    | { db: LogDatabase; ingester: Ingester; wsHandler: WSHandler }
    | undefined;
}

async function initDev(): Promise<{
  db: LogDatabase;
  ingester: Ingester;
  wsHandler: WSHandler;
}> {
  if (globalThis.__slogtail_dev) {
    console.log("[dev-init] reusing existing DB + Ingester + WSHandler");
    // Ensure heartbeat is running (idempotent - stops existing timer first)
    globalThis.__slogtail_dev.wsHandler.startHeartbeat();
    return globalThis.__slogtail_dev;
  }

  console.log("[dev-init] initializing new DB + Ingester + WSHandler");
  const db = new LogDatabase();
  await db.initialize(":memory:");

  const ingester = new Ingester(db, {
    batchSize: 5000,
    flushIntervalMs: 500,
    maxRows: 100_000,
    defaultSource: "http",
  });
  ingester.startTimer();

  const wsHandler = new WSHandler();
  wsHandler.setDatabase(db);
  wsHandler.subscribe(ingester);
  wsHandler.startHeartbeat();

  globalThis.__slogtail_dev = { db, ingester, wsHandler };
  return { db, ingester, wsHandler };
}

export const devResources = await initDev();
