# Kampaku Worker

Kampaku Worker is the execution plane. It registers capabilities, leases jobs from Core, executes them in a sandbox, and returns structured results.

## MVP quickstart

```bash
npm install
npm run build

# With Core and FreeLLMApi running
npm start
```

Real code changes use FreeLLMApi by default. The worker refuses to start without
`FREELLMAPI_API_KEY`; `KAMPAKU_EXECUTOR=echo` is reserved for explicit smoke tests.

### Environment variables

| Variable | Description |
|----------|-------------|
| `KAMPAKU_CORE_URL` | Core base URL (default: `http://127.0.0.1:8080`) |
| `KAMPAKU_WORKER_ID` | Stable worker UUID |
| `KAMPAKU_WORKSPACE` | Root folder containing Kampaku repos |
| `KAMPAKU_EXECUTOR` | `freellmapi` by default; `echo` only for smoke tests |
| `FREELLMAPI_BASE_URL` | OpenAI-compatible endpoint (default: `http://localhost:3001/v1`) |
| `FREELLMAPI_API_KEY` | Unified FreeLLMApi key |
| `KAMPAKU_WORKER_MODEL` | FreeLLMApi model used for task execution (default: `auto`) |

## Repository map

```text
src/
  executor/     Execution engines (FreeLLM coding agent, GitHub CLI, Echo) and session runner
  job-runner/   Polling loop, lease management, and heartbeat
  sandbox/      Ephemeral workspace isolation and path policies
  tools/        Coding tools (file/repo inspection, editing, script execution) and verification
  worker-api/   Typed Core HTTP client for workers
  cli.ts        Executable CLI entry point
  index.ts      Root package export entry point
```
