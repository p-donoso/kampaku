# ADR-0002: MVP implementation stack

- Status: Accepted
- Date: 2026-08-28
- Amended: 2026-09-23 (provider neutrality, software scope) — see **Amendments**

## Context

Kampaku's early project phasing (not the current [roadmap](../roadmap/README.md)) had established
repository boundaries and initial contracts without selecting a runtime. Its next phase required a
thin vertical slice: terminal prompt → goal → planned task → leased job → worker
execution → persisted result.

The MVP must support:

- a local CLI entry point;
- a control plane (Core) with durable state;
- a worker that executes code changes via OpenAI-compatible tool calling;
- LLM-backed planning via a self-hosted OpenAI-compatible endpoint;
- English-only repository content (code comments, docs, commit messages).

## Decision

| Layer | Choice |
|-------|--------|
| Language | TypeScript on Node.js 22+ |
| Packaging | npm workspaces monorepo (`apps/*`, `packages/*`) |
| Core HTTP | Hono + `@hono/node-server` |
| Validation | Zod |
| Persistence | SQLite at `~/.kampaku/kampaku.db` via Drizzle ORM + better-sqlite3 |
| CLI | Commander in `apps/core` |
| Model endpoint (Core) | Any OpenAI-compatible endpoint, configured by the operator |
| Model Broker | `openai` npm client pointed at the configured endpoint |
| Planner | LLM via Model Broker with deterministic stub fallback |
| Worker executor | `openai` client pointed at the configured endpoint with sandbox-scoped tools |
| Auth | None for local MVP |

### Note on the language choice

The table above selects the language **Kampaku is implemented in**. It is not a statement about the
languages Kampaku can work on: the factory is language-agnostic by invariant
([ADR-0004](0004-software-factory-charter.md),
[agnosticism invariants](../concepts/agnosticism-invariants.md) §1). TypeScript was chosen for the
platform because contracts, API clients, and types are shared across Core, Worker, and Web.

## Consequences

### Positive

- Planning, chat, and execution share one model endpoint and one credential.
- JSON contracts map directly to Zod schemas.
- A future web UI can reuse types and API handlers.
- Stub planner and echo executor allow E2E tests without external services.

### Negative

- In stub mode the model-dependent paths are not exercised; a green CI run does not prove the
  provider path.
- Agent quality and tool-calling reliability depend on the model the operator selects. Measured:
  a model may advertise tool support and fail to call tools, so capability must be negotiated per
  endpoint rather than assumed.
- MVP writes directly to the local working tree via sandbox symlinks.

## Alternatives considered

- **Python** — viable, rejected due to implementer preference.
- **Go** — strong for binaries, but TypeScript shares contracts and clients with Core.
- **Cursor SDK as worker executor** — rejected to avoid a second paid provider and API key.

## Amendments (2026-09-23)

### A1. The model endpoint is provider-neutral

The original decision named a specific self-hosted router as the LLM endpoint for Core, the Model
Broker, the planner, and the worker executor, with provider-specific environment variables. That
made a named third-party router part of the product's identity: a product that is provider-agnostic
only when several variables are overridden is not provider-agnostic.

The decision is amended to: **the model endpoint is configuration, not identity.** Any
OpenAI-compatible endpoint is a first-class choice, there is no default host, and a missing
configuration fails with an error naming the setting rather than silently pointing at a local
default. The executable scope and acceptance criteria live in
[multi-provider routing roadmap](../roadmap/11-multi-provider-routing.md).

Consequences: provider-specific environment variables, executor aliases, readiness probes, docs,
and test fixtures are removed rather than deprecated; error messages describe the configured
endpoint and the setting to fix, not a vendor's dashboard. See
[worker capabilities](../development/worker-capabilities.md) and
[provider fidelity eval](../eval/17-provider-fidelity.md).

### A2. The product scope is software

The original context described the worker as executing "code changes" while the surrounding product
documentation described a domain-agnostic harness. That ambiguity is resolved in favour of the
narrower, verifiable claim: Kampaku is a software factory
([ADR-0004](0004-software-factory-charter.md)). The stack choice above is unaffected; the
consequence is that verification capabilities are built for software artifacts rather than
generalised to arbitrary media ([execution assurance](../architecture/execution-assurance.md)).

### A3. Local write path

The sandbox still writes to the local working tree for the MVP. A project's checkout must live
outside the platform monorepo, and linking a repository inside the platform workspace is refused
unless explicitly opted in ([repository strategy](../architecture/repository-strategy.md)).
