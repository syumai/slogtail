import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";

const { values } = parseArgs({
  options: {
    count: { type: "string", short: "n", default: "50" },
  },
  strict: true,
});

const count = parseInt(values.count!, 10);

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

function emit() {
  if (emitted >= count) return;
  process.stdout.write(JSON.stringify(generateLog()) + "\n");
  emitted++;
  if (emitted < count) {
    const delay = 100 + Math.floor(Math.random() * 100);
    setTimeout(emit, delay);
  }
}

emit();
