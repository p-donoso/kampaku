# Kampaku Worker

Kampaku Worker is the execution plane. It registers capabilities, leases jobs from Core, executes them in a sandbox, and returns structured results.

## MVP quickstart

```bash
npm install
npm run build

# With Core and an OpenAI-compatible model endpoint running
npm start
```

Real code changes use the configured model endpoint by default. The worker refuses to start without
`KAMPAKU_MODEL_API_KEY`; `KAMPAKU_EXECUTOR=echo` is reserved for explicit smoke tests.

For a new repository, the coding worker can inspect an empty checkout, create
`package.json`, and run `install_dependencies` before its test and build checks.
Research tasks can use `fetch_public_source` to read bounded text from official
standards and documentation sites over HTTPS; citations must include the returned URL.

### Environment variables

| Variable | Description |
|----------|-------------|
| `KAMPAKU_CORE_URL` | Core base URL (default: `http://127.0.0.1:8080`) |
| `KAMPAKU_WORKER_ID` | Stable worker UUID |
| `KAMPAKU_WORKSPACE` | Root folder containing Kampaku repos |
| `KAMPAKU_EXECUTOR` | `openai-compatible` by default; `echo` only for smoke tests |
| `KAMPAKU_MODEL_BASE_URL` | OpenAI-compatible model endpoint |
| `KAMPAKU_MODEL_API_KEY` | Key for the configured model endpoint |
| `KAMPAKU_WORKER_MODEL` | Model used for task execution (default: `auto`) |

## Repository map

```text
src/
  executor/     Execution engines (model coding agent, GitHub CLI, Echo) and session runner
  job-runner/   Polling loop, lease management, and heartbeat
  sandbox/      Ephemeral workspace isolation and path policies
  tools/        Coding tools (file/repo inspection, editing, script execution) and verification
  worker-api/   Typed Core HTTP client for workers
  cli.ts        Executable CLI entry point
  index.ts      Root package export entry point
```
