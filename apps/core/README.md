# Kampaku Core

Kampaku Core is the control plane for a personal system of persistent, autonomous AI agents.

## MVP quickstart

Prerequisites: Node.js 22+ and a clean monorepo checkout.

```bash
# From the monorepo root
./scripts/install.sh

# Terminal 1 — core + worker with hot reload
kampaku dev

# Terminal 2
kampaku run "Add GET /health endpoint to apps/core"
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
| `kampaku chat` | Chat with Kampaku (main orchestration agent) |
| `kampaku chat -m "..."` | Send a single message to Kampaku |
| `kampaku agents tree` | Show agent hierarchy |
| `kampaku agents show <slug>` | Show agent details |
| `kampaku agents update <slug>` | Update a generated sub-agent |
| `kampaku agents delete <slug> -y` | Delete a generated sub-agent |
| `kampaku status [--goal-id <id>]` | Show goal audit trail |
| `kampaku risks list [--project <slug>]` | List project risks, the ones that stop `projects play` first |
| `kampaku risks show <risk-id>` | Show one risk: title, description, probability, impact, mitigation, review-at, status |
| `kampaku risks mitigate <risk-id> --outcome <what changed>` | Discharge a risk by saying what changed |
| `kampaku risks accept <risk-id> --outcome <why> [--accepted-by <who>]` | Discharge a risk by naming who accepts the exposure and why |
| `kampaku risks escalate <risk-id> --outcome <where it went>` | Discharge a risk by escalating it with the decision asked for |
| `kampaku projects blocked <slug-or-id>` | Every blocked work item of a project: the closure rule that refused it, and the command that clears it |
| `kampaku projects closure <work-item-id>` | Re-decide a blocked leaf's closure against the job already on record (spends no job) |
| `kampaku projects closure <work-item-id> --peer --accept --by <who> --notes <why>` | Record the peer review the refusal asked for, then re-decide |
| `kampaku projects closure <work-item-id> --criterion <ac-N> --accept --by <who> --notes <what>` | Decide one acceptance criterion, then re-decide |
| `kampaku projects retry <work-item-id>` | Re-run a blocked work item's job, after fixing what its refusal was about |

Operational commands (`run`, `status`) talk to Core over HTTP via `CoreClient`, the same client the future web UI will use.

The `kampaku` CLI wrapper runs from TypeScript source (`tsx`) so REPL changes apply immediately. Set `KAMPAKU_CLI_DIST=1` to use the compiled `dist/` binary instead (required for smoke scripts that call `node dist/cli.js` directly).

### Environment variables

| Variable | Description |
|----------|-------------|
| `KAMPAKU_DATA_DIR` | SQLite data directory (default: `~/.kampaku`) |
| `KAMPAKU_WORKSPACE` | Root folder containing Kampaku repos |
| `KAMPAKU_PLANNER` | `llm` by default; uses the configured model endpoint (`stub` is for tests) |
| `KAMPAKU_PLANNER_MODEL` | Model for planning (default: `auto`) |
| `KAMPAKU_PLANNER_REASONING_EFFORT` | Reasoning budget for planning calls (default: `high`; `off` sends none) |
| `KAMPAKU_AGENT` | `stub` or `llm` (Kampaku chat agent; default: `stub`) |
| `KAMPAKU_AGENT_MODEL` | Model for Kampaku chat (default: `auto`) |
| `KAMPAKU_AGENT_REASONING_EFFORT` | Reasoning budget for the calls that do the work (default: `low`; `off` sends none) |
| `KAMPAKU_MODEL_BASE_URL` | OpenAI-compatible endpoint, ending in `/v1` |
| `KAMPAKU_MODEL_API_KEY` | Key for that endpoint (required when `KAMPAKU_AGENT=llm`) |
| `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS` | How long a first model attempt may take (default: `120000`) |
| `KAMPAKU_MODEL_INITIAL_RETRIES` | How many times a first attempt is retried (default: `3`) |
| `KAMPAKU_EXECUTOR` | `openai-compatible` for model-backed agents, `echo` for a dry run |

Workspace `.env` is loaded automatically when present. Values for `KAMPAKU_*` in `.env` override stale shell exports, unless `KAMPAKU_DOTENV_OVERRIDE=0`, which preserves explicit process values.

The two reasoning budgets are the product's answer to being billed per token: planning may think hard,
execution may not. The values are the endpoint's own vocabulary, passed through unchanged, so an endpoint
with a different one is used with that one. Rationale, measurements, and what the product still cannot say
about its own cost: [`docs/concepts/token-economy.md`](../../docs/concepts/token-economy.md).

### Endpoint setup

Any OpenAI-compatible endpoint works: a hosted API, a local server, or a router in front of several of
them. The contract is provider-neutral and has one spelling.

1. Set `KAMPAKU_MODEL_BASE_URL` to the endpoint, ending in `/v1`.
2. Set `KAMPAKU_MODEL_API_KEY` if the endpoint needs one.
3. The model must support **tool calling**; the front office cannot work without it.
4. `kampaku dev` can also start a **local** endpoint service. That is a convenience, not part of the
   contract: it happens only when `KAMPAKU_DEV_ENDPOINT_SERVICE` names a compose service, and
   `--no-model-endpoint` skips it.

**With no base URL set, a model call fails with a message naming the setting. There is no implicit
local connection** — an endpoint that was never named is never dialled. `KAMPAKU_AGENT=stub` runs without
any endpoint at all.

See [ADR-0002](../../docs/adr/0002-mvp-implementation-stack.md) for stack decisions.

## Repository map

```text
src/
  agents/        Agent runtime, sessions, tool registry, and definitions
  api/           HTTP control plane routes and app factory (Hono)
  application/   Domain business logic (pm, wiki, jobs, settings, bootstrap, agents)
  cli/           Commander CLI subcommands and interactive REPL
  client/        Typed HTTP client (BaseHttpClient and CoreClient)
  delegator/     Intent decomposition, recursive tree planning, and agent routing
  model-broker/  LLM inference client for OpenAI-compatible backends
  persistence/   SQLite stores, BaseStore, Drizzle schema, and migrations
  planner/       Single-goal task planning, prompt generation, and job scheduling
  cli.ts         Executable CLI entrypoint
  index.ts       Root package export entrypoint
```

## Related repositories

- `apps/worker` — isolated execution plane
- `packages/contracts` — shared machine-readable contracts
- `docs` — cross-system architecture and product documentation
