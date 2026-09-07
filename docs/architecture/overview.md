# Architecture overview

```text
User interfaces (Next.js Web / Terminal CLI)
                    |
              HTTP API (Hono)
                    |
      Intent Delegator / PM Layer
                    |
         +----------+----------+
         |                     |
   Model Broker          BaseStore Layer (SQLite)
         |                     |
         +----------+----------+
                    |
               Worker API
                    |
      Workers: Job Runner + Executor + Sandbox + Coding Tools
```

Kampaku separates a durable control plane from an isolated execution plane. Core owns intent, policy, planning, scheduling, knowledge metadata, and canonical state. Workers own bounded execution. Contracts define their shared language.

The system is designed to continue safely for hours, days, or weeks: every meaningful transition is durable; work is leased rather than assumed; retries are expected; privileged actions are policy-controlled; and humans can inspect, pause, redirect, or cancel work.

## Monorepo layout

| Path | Role |
|------|------|
| `apps/core` | Control plane: API, CLI, agent runtime, persistence |
| `apps/worker` | Execution plane: job lease loop, sandbox, coding tools |
| `apps/web` | Operator UI: Next.js App Router + thematic component modules |
| `packages/contracts` | Shared OpenAPI, JSON Schemas, skill catalog, tool specs |
| `docs` | Architecture, product, security, branding, evaluation |

Managed user projects stay in external repositories. They are referenced by runtime project records and are never copied into this platform tree.

## System modules

- **Core Control Plane (`apps/core`)** — Hono REST API, Commander CLI, intent delegator, planner, model broker, agent runtime tools, and SQLite stores extending `BaseStore`.
- **Web Frontend (`apps/web`)** — Dashboard, chat, project/agent/settings section layouts, floating detail panels, and domain-partitioned API clients under `apps/web/src/lib/api/`.
- **Worker Execution Plane (`apps/worker`)** — Job runner leases work from Core; executors (`freellm-agent`, `echo`, `github`) run inside a sandbox; LLM-callable filesystem tools live in `src/tools/`, executors in `src/executor/`.
- **Contracts (`packages/contracts`)** — Machine-readable interfaces validated by `npm run contracts:check`.

## Persistence

SQLite via Drizzle ORM. Domain stores (`AgentStore`, `PmStore`, `WikiStore`, …) extend `BaseStore` for shared error codes and database access. Schema bootstrap and incremental migrations live in `apps/core/src/persistence/migrations.ts`.

## Operator surfaces

Chat, CLI, and web must agree on the same resource IDs and fields after a mutation. Section routes (`/projects`, `/agents`, `/settings`) use Next.js `layout.tsx` for shared headers and sub-navigation. Entity details open as floating panels driven by query params rather than deep standalone pages.

## Related docs

- [Worker architecture](worker.md)
- [Agent hierarchy](agent-hierarchy.md)
- [Data ownership](data-ownership.md)
- [Repository strategy](repository-strategy.md)
- [Security model](../security/security-model.md)
- [Core–worker protocol](../protocols/control-worker.md)
