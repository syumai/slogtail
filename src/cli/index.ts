import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "../server/index";
import { createApiApp } from "../server/app";
import { LogDatabase } from "../server/db";
import { Ingester } from "../server/ingester";
import { WSHandler } from "../server/ws";
import type { CLIOptions } from "../types";

// ---------------------------------------------------------------------------
// CLI Argument Parsing (pure function, exported for testing)
// ---------------------------------------------------------------------------

export interface ParsedCLIOptions extends CLIOptions {
  help?: boolean;
}

export function parseCLIArgs(args: string[]): ParsedCLIOptions {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", short: "p" },
      "max-rows": { type: "string", short: "m" },
      "batch-size": { type: "string" },
      db: { type: "string" },
      "no-ui": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  const result: ParsedCLIOptions = {
    port: values.port !== undefined ? parseInt(values.port, 10) : 8080,
    maxRows:
      values["max-rows"] !== undefined
        ? parseInt(values["max-rows"], 10)
        : 100_000,
    batchSize:
      values["batch-size"] !== undefined
        ? parseInt(values["batch-size"], 10)
        : 5000,
    db: values.db ?? ":memory:",
    noUi: values["no-ui"] ?? false,
  };

  if (values.help) {
    result.help = true;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const USAGE = `
Usage: <command> | lduck [options]

Options:
  -p, --port <port>       Server port (default: 8080)
  -m, --max-rows <n>      Maximum rows to keep (default: 100000)
      --batch-size <n>    Batch INSERT size (default: 5000)
      --db <path>         DuckDB persistence path (default: :memory:)
      --no-ui             Disable Web UI, API server only
  -h, --help              Show this help message

Examples:
  kubectl logs -f deploy/api | lduck --port 8080
  cat app.log | lduck --db ./logs.duckdb
  docker logs -f myapp | lduck --no-ui -p 9090
`.trimStart();

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseCLIArgs(process.argv.slice(2));

  if (opts.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  // Initialize LogDatabase
  const db = new LogDatabase();
  await db.initialize(opts.db);

  // Create Ingester
  const ingester = new Ingester(db, {
    batchSize: opts.batchSize,
    flushIntervalMs: 500,
    maxRows: opts.maxRows,
    defaultSource: "default",
  });

  // Create WebSocket handler
  const wsHandler = new WSHandler();
  wsHandler.setDatabase(db);
  wsHandler.subscribe(ingester);

  // Create API app with database dependency
  const apiApp = createApiApp(db, ingester);

  // Create WebSocket support.  We pass a mutable init object so we can
  // register the upgradeWebSocket middleware inside the setup callback
  // (before the catch-all "*" route) and later point init.app to fullApp.
  const wsInit = { app: null as unknown as ReturnType<typeof createApp> };
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket(wsInit);

  // Build the full app.  Routes registered in setup() come before the
  // catch-all HTML handler added by createApp, so the WebSocket route
  // will match first.
  const fullApp = createApp("/static/client.js", (app) => {
    // Mount real API routes
    app.route("/", apiApp);

    // WebSocket route for live tail (must be before the catch-all "*")
    app.get(
      "/api/ws/tail",
      upgradeWebSocket(() => ({
        onOpen(_evt, ws) {
          wsHandler.handleConnection(ws);
        },
        onMessage(evt, ws) {
          wsHandler.handleMessage(ws, evt.data.toString());
        },
        onClose(_evt, ws) {
          wsHandler.handleClose(ws);
        },
      })),
    );

    // Add static file serving if UI is enabled
    if (!opts.noUi) {
      app.use("/static/*", serveStatic({ root: import.meta.dirname }));
    }
  });

  // Now that fullApp exists, update the reference for injectWebSocket
  wsInit.app = fullApp;

  // Start HTTP server
  const server = serve(
    { fetch: fullApp.fetch, port: opts.port, hostname: "127.0.0.1" },
    (info) => {
      console.log(`lduck server listening on http://localhost:${info.port}`);
    },
  );

  // Inject WebSocket into the server
  injectWebSocket(server);

  // Start ingesting from stdin
  ingester.start(process.stdin);
}

// Only run main when this module is executed directly (not during tests)
if (!process.env.VITEST) {
  main().catch((err) => {
    console.error("Failed to start lduck:", err);
    process.exit(1);
  });
}
