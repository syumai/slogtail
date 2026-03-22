import { randomUUID } from "node:crypto";

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

const MULTILINE_MESSAGES = [
  "Error: connection refused\n  at connect (net.js:123)\n  at Socket.connect (socket.js:45)\n  at Object.createConnection (http.js:67)",
  "panic: runtime error: index out of range\ngoroutine 1 [running]:\nmain.main()\n\t/app/main.go:42",
  "ValidationError: invalid input\n  - field 'email': must be a valid email\n  - field 'age': must be >= 0",
  '{\n  "error": "timeout",\n  "details": {\n    "endpoint": "/api/users",\n    "method": "GET",\n    "elapsed_ms": 30000\n  },\n  "retry": false\n}',
  '{\n  "query": "SELECT * FROM orders WHERE id = $1",\n  "params": [42],\n  "rows_affected": 0,\n  "duration": "1.23s"\n}',
];

function generateLog() {
  const service = pick(SERVICES);
  const level = pick(LEVELS);
  const log: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: Math.random() < 0.5 ? level : level.toLowerCase(),
    message: pick(MESSAGES[service]),
    service,
    host: pick(HOSTS),
    duration_ms: Math.round(Math.random() * 500 * 100) / 100,
    trace_id: randomUUID(),
  };
  if (Math.random() < 0.3) {
    log.detail = pick(MULTILINE_MESSAGES);
  }
  return log;
}

const INVALID_LINES = [
  '{"timestamp":"2024-01-01T00:00:00Z","level":"INFO',
  "[WARN] plain text log without JSON",
  "{{{malformed json",
  "--- server restart ---",
  '{"level": "ERROR", "message": "unclosed string}',
];

function emit() {
  if (Math.random() < 0.1) {
    process.stdout.write(pick(INVALID_LINES) + "\n");
  } else {
    process.stdout.write(JSON.stringify(generateLog()) + "\n");
  }
  const delay = 500 + Math.floor(Math.random() * 500);
  setTimeout(emit, delay);
}

emit();
