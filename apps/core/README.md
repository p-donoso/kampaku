# Kampaku Core

Kampaku Core is the control plane for a personal system of persistent, autonomous AI agents.

## MVP quickstart

Prerequisites: Node.js 22+, a sibling checkout of `kampaku-worker` and `kampaku-contracts`.

```bash
# From the workspace root
../scripts/install.sh

# Terminal 1 — core + worker with hot reload
kampaku dev

# Terminal 2
kampaku run "Add GET /health endpoint to kampaku-core"
kampaku status --last
```

`install.sh` builds both packages, bootstraps the local project registry, and installs the `kampaku` CLI to `~/.local/bin` (no `sudo` required).

### CLI commands

| Command | Description |
|---------|-------------|
| `kampaku bootstrap` | Initialize SQLite data dir and register the Kampaku project |
| `kampaku serve` | Start the HTTP control plane |
| `kampaku dev` | Start core + worker with `tsx watch` hot reload |
| `kampaku run <objective>` | Submit a goal and wait for completion |
| `kampaku jobs watch <jobId>` | Poll an existing job until it finishes (use after `projects step`) |
| `kampaku chat` | Chat with Kampaku (main advisor agent) |
| `kampaku chat -m "..."` | Send a single message to Kampaku |
| `kampaku agents tree` | Show agent hierarchy |
| `kampaku agents show <slug>` | Show agent details |
| `kampaku agents update <slug>` | Update a generated sub-agent |
| `kampaku agents delete <slug> -y` | Delete a generated sub-agent |
| `kampaku status [--goal-id <id>]` | Show goal audit trail |

Operational commands (`run`, `status`) talk to Core over HTTP via `CoreClient`, the same client the future web UI will use.

The `kampaku` CLI wrapper runs from TypeScript source (`tsx`) so REPL changes apply immediately. Set `KAMPAKU_CLI_DIST=1` to use the compiled `dist/` binary instead (required for smoke scripts that call `node dist/cli.js` directly).

### Environment variables

| Variable | Description |
|----------|-------------|
| `KAMPAKU_DATA_DIR` | SQLite data directory (default: `~/.kampaku`) |
| `KAMPAKU_WORKSPACE` | Root folder containing Kampaku repos |
| `KAMPAKU_PLANNER` | `llm` by default; uses FreeLLMApi (`stub` is for tests) |
| `KAMPAKU_PLANNER_MODEL` | FreeLLMApi model for planning (default: `auto`) |
| `KAMPAKU_AGENT` | `stub` or `llm` (Kampaku chat agent; default: `stub`) |
| `KAMPAKU_AGENT_MODEL` | Model for Kampaku chat (default: `auto`) |
| `FREELLMAPI_BASE_URL` | FreeLLMApi OpenAI-compatible endpoint |
| `FREELLMAPI_API_KEY` | Unified FreeLLMApi key (required when `KAMPAKU_AGENT=llm`) |
| `FREELLMAPI_ENCRYPTION_KEY` | 64-char hex key for FreeLLMApi Docker (`ENCRYPTION_KEY`) |

Workspace `.env` is loaded automatically when present. Values for `KAMPAKU_*` and `FREELLMAPI_*` in `.env` override stale shell exports.

### FreeLLMApi setup

1. Start with `kampaku dev` (starts FreeLLMApi when the planner or chat agent uses `llm`).
2. Open http://localhost:3001 and copy the **unified API key** from Settings into `FREELLMAPI_API_KEY` in `.env`.
3. Add **upstream provider API keys** in the FreeLLMApi dashboard (OpenAI, Anthropic, Ollama, etc.). Kampaku chat needs a model that supports tool-calling.
4. Restart `kampaku dev` so Core picks up the key.

The unified key is stored in FreeLLMApi's SQLite volume and **does not change on normal restarts**. It resets only if you run `docker compose down -v` or regenerate the key in the dashboard.

If chat returns `401 Invalid API key`, check that `.env` matches the dashboard key. `kampaku dev` will try to read the key from the running container and warn when `.env` is stale.

See [ADR-0002](../kampaku-docs/adr/0002-mvp-implementation-stack.md) for stack decisions.

## Repository map

```text
src/
  application/   Shared use cases (goals, projects, health)
  api/           HTTP control plane (Hono)
  client/        Typed HTTP client (CLI + future web)
  cli/           Commander CLI commands
  bootstrap/     Local project bootstrap
  model-broker/  FreeLLMApi client
  persistence/   SQLite + Drizzle
  planner/       Goal → FreeLLMApi planning → task
  agents/        Kampaku advisor agent (repo) + runtime
  scheduler/     Goal creation and job enqueue
  cli.ts         CLI entry point
```

## Related repositories

- `kampaku-worker` — isolated execution plane
- `kampaku-contracts` — shared machine-readable contracts
- `kampaku-docs` — cross-system architecture and product documentation

## Licensing

No license has been selected. All rights are reserved until the project owners adopt and publish a license explicitly.
