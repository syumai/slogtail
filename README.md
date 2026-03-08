# slogtail

Pipe-friendly JSON log viewer powered by DuckDB. Reads JSON lines from stdin or HTTP, stores them in DuckDB, and serves a real-time search UI.

## Install

```bash
npm install -g slogtail
```

## Quick Start

Pipe any JSON-lines output into slogtail:

```bash
kubectl logs -f deploy/api | slogtail
cat app.log | slogtail --port 9090
docker logs -f myapp | slogtail --db ./logs.duckdb
```

Then open http://localhost:8080 in your browser.

## Features

- Full-text search across all log fields
- Filter by level, service, host, source, and time range
- Faceted navigation with custom facet support
- Live tail via WebSocket (with polling fallback)
- Raw SQL queries against DuckDB
- CSV / JSON export
- HTTP ingestion endpoint for batch log submission
- In-memory by default, optional file-based persistence

## CLI Options

```
Usage: <command> | slogtail [options]

Options:
  -p, --port <port>       Server port (default: 8080)
  -m, --max-rows <n>      Maximum rows to keep (default: 100000)
      --batch-size <n>    Batch INSERT size (default: 5000)
      --db <path>         DuckDB persistence path (default: :memory:)
      --no-ui             Disable Web UI, API server only
  -h, --help              Show this help message
```

## JSON Format

Each line should be a JSON object. slogtail normalizes common field names automatically:

| Field | Aliases |
|-------|---------|
| `timestamp` | `ts`, `time`, `@timestamp`, `datetime` |
| `level` | `severity`, `loglevel`, `lvl`, `priority` |
| `message` | `msg`, `body`, `text` |
| `service` | `svc`, `app`, `component`, `logger` |
| `trace_id` | `traceId`, `request_id`, `correlation_id` |
| `host` | |
| `duration_ms` | |
| `source` | |

Unrecognized fields are preserved in `_raw` and searchable via raw SQL.

## HTTP Ingestion

You can also send logs via HTTP instead of stdin:

```bash
# Single log
curl -X POST http://localhost:8080/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"level":"INFO","message":"hello from curl","service":"my-app"}'

# Batch
curl -X POST http://localhost:8080/api/ingest \
  -H 'Content-Type: application/json' \
  -d '[{"level":"INFO","message":"log 1"},{"level":"ERROR","message":"log 2"}]'
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check with uptime |
| `GET` | `/api/logs` | Query logs (supports `search`, `level`, `service`, `source`, `startTime`, `endTime`, `limit`, `offset`, `order`) |
| `GET` | `/api/stats` | Log statistics by level |
| `GET` | `/api/facets` | Facet value distribution |
| `GET` | `/api/schema` | Database schema |
| `POST` | `/api/ingest` | Ingest JSON logs (single object or array) |
| `POST` | `/api/query` | Execute raw SQL |
| `POST` | `/api/export` | Export logs as CSV or JSON |
| `WS` | `/api/ws/tail` | Live tail WebSocket |

## Development

```bash
git clone https://github.com/syumai/slogtail.git
cd slogtail
pnpm install
pnpm dev            # Start Vite dev server
pnpm test           # Run tests
pnpm lint           # Lint + type check
pnpm build          # Build for production
```

### Test Log Generation

```bash
# stdout (pipe to slogtail)
pnpm generate-logs | slogtail

# relay (send to running slogtail instance)
pnpm generate-logs | slogtail relay --url http://localhost:8080
```

## License

MIT
