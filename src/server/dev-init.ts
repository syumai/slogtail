import { LogDatabase } from "./db";
import { Ingester } from "./ingester";

// Persist DB and Ingester across Vite HMR reloads
declare global {
  // eslint-disable-next-line no-var
  var __lduck_dev: { db: LogDatabase; ingester: Ingester } | undefined;
}

async function initDev(): Promise<{ db: LogDatabase; ingester: Ingester }> {
  if (globalThis.__lduck_dev) {
    console.log("[dev-init] reusing existing DB + Ingester");
    return globalThis.__lduck_dev;
  }

  console.log("[dev-init] initializing new DB + Ingester");
  const db = new LogDatabase();
  await db.initialize(":memory:");

  const ingester = new Ingester(db, {
    batchSize: 5000,
    flushIntervalMs: 500,
    maxRows: 100_000,
    defaultSource: "http",
  });
  ingester.startTimer();

  globalThis.__lduck_dev = { db, ingester };
  return { db, ingester };
}

export const devResources = await initDev();
