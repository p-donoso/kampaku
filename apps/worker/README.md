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
  worker-api/   Core HTTP client
  job-runner/   Poll loop
  sandbox/      Ephemeral workspace symlinks
  executor/     Job execution session
  tools/        echo and FreeLLMApi agent adapters
  cli.ts        Entry point
```
## Context7 documentation access

Coding workers can consult current library documentation through Context7 when both variables are configured:

```bash
export CONTEXT7_API_KEY=your-context7-key
export KAMPAKU_CONTEXT7_URL=https://mcp.context7.com/mcp
```

The worker exposes only `resolve_library_id` and `query_docs`; the key is read at runtime and is never stored in the repository.
