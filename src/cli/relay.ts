import { parseArgs } from "node:util";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------------------
// Relay CLI Argument Parsing (pure function, exported for testing)
// ---------------------------------------------------------------------------

export interface RelayOptions {
  url: string;
  service: string | undefined;
  batchSize: number;
  intervalMs: number;
  help: boolean;
}

export function parseRelayArgs(args: string[]): RelayOptions {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: "string", short: "u" },
      service: { type: "string", short: "s" },
      "batch-size": { type: "string" },
      interval: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  return {
    url: values.url ?? "http://localhost:8080",
    service: values.service,
    batchSize:
      values["batch-size"] !== undefined
        ? parseInt(values["batch-size"], 10)
        : 100,
    intervalMs:
      values.interval !== undefined ? parseInt(values.interval, 10) : 500,
    help: values.help ?? false,
  };
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const RELAY_USAGE = `
Usage: <command> | lduck relay [options]

Relay stdin JSON logs to a running lduck server via HTTP POST.

Options:
  -u, --url <url>         Target lduck server URL (default: http://localhost:8080)
  -s, --service <name>    Service name to inject into each log entry
      --batch-size <n>    Lines per HTTP batch (default: 100)
      --interval <ms>     Flush interval in milliseconds (default: 500)
  -h, --help              Show this help message

Examples:
  kubectl logs -f deploy/api | lduck relay --service api
  cat app.log | lduck relay --url http://lduck:9090 --service backend
  docker logs -f myapp | lduck relay -s myapp -u http://localhost:8080
`.trimStart();

// ---------------------------------------------------------------------------
// Line parsing (exported for testing)
// ---------------------------------------------------------------------------

export function parseLine(
  line: string,
  service: string | undefined,
): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = { message: trimmed, level: "INFO", timestamp: new Date().toISOString() };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  if (service !== undefined && !("service" in parsed)) {
    parsed.service = service;
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Main relay logic
// ---------------------------------------------------------------------------

export async function runRelay(args: string[]): Promise<void> {
  const opts = parseRelayArgs(args);

  if (opts.help) {
    process.stdout.write(RELAY_USAGE);
    process.exit(0);
  }

  const ingestUrl = opts.url.replace(/\/$/, "") + "/api/ingest";

  let buffer: Record<string, unknown>[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let totalSent = 0;
  let totalErrors = 0;
  let stdinClosed = false;

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;

    const batch = buffer;
    buffer = [];

    try {
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[relay] HTTP ${res.status}: ${text}`);
        totalErrors += batch.length;
      } else {
        const result = (await res.json()) as { accepted: number };
        totalSent += result.accepted;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[relay] Send failed: ${message}`);
      totalErrors += batch.length;
    }
  }

  function resetFlushTimer(): void {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flush();
      if (!stdinClosed) {
        resetFlushTimer();
      }
    }, opts.intervalMs);
  }

  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  console.error(`[relay] Relaying to ${ingestUrl}${opts.service ? ` (service: ${opts.service})` : ""}`);

  resetFlushTimer();

  rl.on("line", (line: string) => {
    const parsed = parseLine(line, opts.service);
    if (parsed === null) return;

    buffer.push(parsed);

    if (buffer.length >= opts.batchSize) {
      flush();
    }
  });

  await new Promise<void>((resolve) => {
    rl.on("close", async () => {
      stdinClosed = true;
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flush();

      if (totalSent > 0 || totalErrors > 0) {
        console.error(
          `[relay] Done. Sent: ${totalSent}, Errors: ${totalErrors}`,
        );
      }
      resolve();
    });
  });
}
