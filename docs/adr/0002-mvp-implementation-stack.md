# ADR-0002: MVP implementation stack

## Status

Accepted

## Context

Kampaku Phase 0 established repository boundaries and initial contracts without selecting a runtime. Phase 1 requires a thin vertical slice: terminal prompt → goal → planned task → leased job → worker execution → persisted result.

The MVP must support:

- a local CLI entry point;
- a control plane (Core) with durable state;
- a worker that executes code changes via FreeLLMApi tool calling;
- LLM-backed planning via a self-hosted OpenAI-compatible router (FreeLLMApi);
- English-only repository content (code comments, docs, commit messages).

## Decision

| Layer | Choice |
|-------|--------|
| Language | TypeScript on Node.js 22+ |
| Packaging | `pnpm` + `package.json` per repository |
| Core HTTP | Hono + `@hono/node-server` |
| Validation | Zod |
| Persistence | SQLite at `~/.kampaku/kampaku.db` via Drizzle ORM + better-sqlite3 |
| CLI | Commander in `kampaku-core` |
| LLM routing (Core) | FreeLLMApi at `http://localhost:3001/v1` |
| Model Broker | `openai` npm client pointed at FreeLLMApi |
| Planner | LLM via Model Broker with deterministic stub fallback |
| Worker executor | `openai` client pointed at FreeLLMApi with sandbox-scoped tools |
| Auth | None for local MVP |

## Consequences

### Positive

- Planning, chat, and execution share one FreeLLMApi endpoint and unified key.
- JSON contracts map directly to Zod schemas.
- A future web UI can reuse types and API handlers.
- Stub planner and echo executor allow E2E tests without external services.

### Negative

- FreeLLMApi is an operational dependency; stub mode is required for offline development.
- Agent quality and tool-calling reliability depend on the free model selected by the router.
- MVP writes directly to the local working tree via sandbox symlinks.

## Alternatives considered

- **Python** — viable, rejected due to implementer preference.
- **Go** — strong for binaries, but TypeScript shares contracts and clients with Core.
- **Cursor SDK as worker executor** — rejected to avoid a second paid provider and API key.
