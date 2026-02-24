import { LogDatabase } from "./db";
import { Ingester } from "./ingester";
import { WSHandler } from "./ws";

// Persist DB, Ingester, and WSHandler across Vite HMR reloads
declare global {
  // eslint-disable-next-line no-var
  var __lduck_dev:
    | { db: LogDatabase; ingester: Ingester; wsHandler: WSHandler }
    | undefined;
}

async function initDev(): Promise<{
  db: LogDatabase;
  ingester: Ingester;
  wsHandler: WSHandler;
}> {
  if (globalThis.__lduck_dev) {
    console.log("[dev-init] reusing existing DB + Ingester + WSHandler");
    return globalThis.__lduck_dev;
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

  globalThis.__lduck_dev = { db, ingester, wsHandler };
  return { db, ingester, wsHandler };
}

export const devResources = await initDev();
