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
  maxRetries: number;
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
      "max-retries": { type: "string" },
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
    maxRetries:
      values["max-retries"] !== undefined
        ? parseInt(values["max-retries"], 10)
        : 3,
    help: values.help ?? false,
  };
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const RELAY_USAGE = `
Usage: <command> | slogtail relay [options]

Relay stdin JSON logs to a running slogtail server via HTTP POST.

Options:
  -u, --url <url>         Target slogtail server URL (default: http://localhost:8080)
  -s, --service <name>    Service name to inject into each log entry
      --batch-size <n>    Lines per HTTP batch (default: 100)
      --interval <ms>     Flush interval in milliseconds (default: 500)
      --max-retries <n>   Max retry attempts on transient failure (default: 3)
  -h, --help              Show this help message

Examples:
  kubectl logs -f deploy/api | slogtail relay --service api
  cat app.log | slogtail relay --url http://slogtail:9090 --service backend
  docker logs -f myapp | slogtail relay -s myapp -u http://localhost:8080
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
// Exponential backoff helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Compute backoff delay: baseDelay * 2^attempt, capped at maxDelay. */
export function computeBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
): number {
  return Math.min(baseDelay * 2 ** attempt, maxDelay);
}

export interface FlushResult {
  accepted: number;
  errors: number;
  retries: number;
}

// ---------------------------------------------------------------------------
// Relay summary types and helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Accumulated send statistics for the entire relay session. */
export interface RelaySummary {
  totalSent: number;
  totalErrors: number;
  totalRetries: number;
}

/** Create a new RelaySummary with a FlushResult accumulated (immutable). */
export function accumulateFlushResult(
  summary: RelaySummary,
  result: FlushResult,
): RelaySummary {
  return {
    totalSent: summary.totalSent + result.accepted,
    totalErrors: summary.totalErrors + result.errors,
    totalRetries: summary.totalRetries + result.retries,
  };
}

/** Format a RelaySummary as a human-readable string for stderr output. */
export function formatRelaySummary(summary: RelaySummary): string {
  return `[relay] Done. Sent: ${summary.totalSent}, Errors: ${summary.totalErrors}, Retries: ${summary.totalRetries}`;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

interface BackoffOptions {
  baseDelay?: number;
  maxDelay?: number;
}

const DEFAULT_BASE_DELAY = 100;
const DEFAULT_MAX_DELAY = 30_000;

/** Returns true if the HTTP status code is a transient server error worth retrying. */
function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

/**
 * Flush a batch with exponential backoff retry.
 *
 * - On success: returns { accepted, errors: 0, retries }
 * - On non-retryable failure (4xx): returns { accepted: 0, errors: batch.length, retries: 0 }
 * - On retryable failure after exhausting retries: returns { accepted: 0, errors: batch.length, retries: maxRetries }
 */
export async function flushWithRetry(
  batch: Record<string, unknown>[],
  ingestUrl: string,
  maxRetries: number,
  fetchFn: FetchFn = globalThis.fetch,
  backoffOptions?: BackoffOptions,
): Promise<FlushResult> {
  const baseDelay = backoffOptions?.baseDelay ?? DEFAULT_BASE_DELAY;
  const maxDelay = backoffOptions?.maxDelay ?? DEFAULT_MAX_DELAY;

  let retries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Wait before retry (not before the initial attempt)
    if (attempt > 0) {
      const delay = computeBackoffDelay(attempt - 1, baseDelay, maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
      retries++;
    }

    try {
      const res = await fetchFn(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });

      if (res.ok) {
        const result = (await res.json()) as { accepted: number };
        return { accepted: result.accepted, errors: 0, retries };
      }

      // Non-retryable client error
      if (!isRetryableStatus(res.status)) {
        const text = await res.text();
        console.error(`[relay] HTTP ${res.status}: ${text}`);
        return { accepted: 0, errors: batch.length, retries: 0 };
      }

      // Retryable server error - log and continue to next attempt
      const text = await res.text();
      console.error(`[relay] HTTP ${res.status}: ${text} (attempt ${attempt + 1}/${maxRetries + 1})`);
    } catch (err) {
      // Network error - retryable
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[relay] Send failed: ${message} (attempt ${attempt + 1}/${maxRetries + 1})`);
    }
  }

  // All retries exhausted
  return { accepted: 0, errors: batch.length, retries };
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
  let summary: RelaySummary = { totalSent: 0, totalErrors: 0, totalRetries: 0 };
  let stdinClosed = false;

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;

    const batch = buffer;
    buffer = [];

    const result = await flushWithRetry(batch, ingestUrl, opts.maxRetries);
    summary = accumulateFlushResult(summary, result);
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

      console.error(formatRelaySummary(summary));
      resolve();
    });
  });
}
