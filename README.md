# lduck

Pipe-friendly log viewer. Reads JSON lines from stdin, stores them in DuckDB, and serves a React-based search UI.

## Setup

```bash
pnpm install
```

## Usage

Pipe any JSON-lines output into lduck:

```bash
kubectl logs -f deploy/api | node src/cli/index.ts
cat app.log | node src/cli/index.ts --port 9090
docker logs -f myapp | node src/cli/index.ts --db ./logs.duckdb
```

### CLI Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--port <port>` | `-p` | `8080` | Server port |
| `--max-rows <n>` | `-m` | `100000` | Maximum rows to keep |
| `--batch-size <n>` | | `5000` | Batch INSERT size |
| `--db <path>` | | `:memory:` | DuckDB persistence path |
| `--no-ui` | | `false` | Disable Web UI, API server only |
| `--help` | `-h` | | Show help message |

### Expected JSON Format

Each line should be a JSON object. lduck recognizes these fields (with aliases):

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

## Test Log Generation

A helper script generates random structured logs for testing:

```bash
# Generate 50 logs (default) and pipe to lduck
node scripts/generate-logs.ts | node src/cli/index.ts

# Generate 200 logs on a custom port
node scripts/generate-logs.ts -n 200 | node src/cli/index.ts --port 8888
```

The script outputs JSON lines at ~100-200ms intervals with randomized levels, services, messages, and trace IDs.

## Scripts

```bash
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm test         # Run tests
pnpm lint         # Lint + type check
pnpm format       # Format code
```

## Production

```bash
pnpm build
node dist/index.js
```
