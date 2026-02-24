import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";

const { values } = parseArgs({
  options: {
    count: { type: "string", short: "n", default: "100" },
    url: { type: "string", default: "http://localhost:5173/api/ingest" },
    "batch-size": { type: "string", default: "5" },
    interval: { type: "string", default: "500" },
  },
  strict: true,
});

const count = parseInt(values.count!, 10);
const url = values.url!;
const batchSize = parseInt(values["batch-size"]!, 10);
const intervalMs = parseInt(values.interval!, 10);

const LEVELS = ["DEBUG", "INFO", "INFO", "INFO", "WARN", "ERROR", "FATAL"] as const;
const SERVICES = ["api", "auth", "worker", "gateway"] as const;
const HOSTS = ["server-1", "server-2", "server-3"] as const;

const MESSAGES: Record<string, string[]> = {
  api: [
    "GET /api/users 200 OK",
    "POST /api/orders created successfully",
    "Request timeout waiting for upstream",
    "Rate limit exceeded for client",
    "Database query completed",
  ],
  auth: [
    "User login successful",
    "Token refresh completed",
    "Invalid credentials attempt detected",
    "Session expired for user",
    "OAuth callback received",
  ],
  worker: [
    "Job enqueued for processing",
    "Batch processing completed",
    "Worker heartbeat sent",
    "Retry attempt for failed job",
    "Queue depth threshold exceeded",
  ],
  gateway: [
    "Upstream health check passed",
    "Connection pool exhausted",
    "TLS handshake completed",
    "Circuit breaker tripped",
    "Request routed to fallback",
  ],
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateLog() {
  const service = pick(SERVICES);
  return {
    timestamp: new Date().toISOString(),
    level: pick(LEVELS),
    message: pick(MESSAGES[service]),
    service,
    host: pick(HOSTS),
    duration_ms: Math.round(Math.random() * 500 * 100) / 100,
    trace_id: randomUUID(),
  };
}

let emitted = 0;

async function emitBatch() {
  if (emitted >= count) return;

  const remaining = count - emitted;
  const size = Math.min(batchSize, remaining);
  const batch = Array.from({ length: size }, () => generateLog());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${await res.text()}`);
    } else {
      const result = (await res.json()) as { accepted: number };
      emitted += size;
      console.log(`Sent ${size} logs (${emitted}/${count}) - accepted: ${result.accepted}`);
    }
  } catch (err) {
    console.error("Failed to send:", err instanceof Error ? err.message : err);
  }

  if (emitted < count) {
    setTimeout(emitBatch, intervalMs);
  }
}

emitBatch();
