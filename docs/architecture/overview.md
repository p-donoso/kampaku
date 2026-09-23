# Architecture overview

```text
User interfaces (Next.js Web / Terminal CLI / Chat)
                    |
              HTTP API (Hono)
                    |
      Front office · Intent triage · Plan gating
                    |
         +----------+----------+
         |                     |
   Model Broker          BaseStore Layer (SQLite)
         |                     |
         +----------+----------+
                    |
               Worker API
                    |
      Workers: Job Runner + Executor + Sandbox + Tools
                    |
   ┌────────────────┴────────────────┐
   │  Evidence · quality gates ·     │
   │  claim audit · objective audit  │
   └─────────────────────────────────┘
```

Kampaku separates a durable control plane from an isolated execution plane. Core owns intent, policy,
planning, scheduling, knowledge metadata, and canonical state. Workers own bounded execution.
Contracts define their shared language. Inspection — evidence records, quality gates, claim
reconciliation, objective coverage — is what turns a claim into a verified outcome.

The system is designed to continue safely for hours, days, or weeks: every meaningful transition is
durable; work is leased rather than assumed; retries are expected; privileged actions are
policy-controlled; and a person can inspect, pause, redirect, or cancel work.

The product is a **software factory** ([statute](../product/software-factory.md)); the stations this
architecture implements are intake, planning, staffing, execution, inspection, and shipment.

## Monorepo layout

| Path | Role |
|------|------|
| `apps/core` | Control plane: API, CLI, agent runtime, planner, persistence |
| `apps/worker` | Execution plane: job lease loop, sandbox, tools, executors |
| `apps/web` | Operator UI: Next.js App Router + thematic component modules |
| `packages/contracts` | Shared OpenAPI, JSON Schemas, skill catalog, tool specs |
| `docs` | Product, architecture, security, branding, evaluation |

Projects the factory works on live in external repositories. They are referenced by runtime project
records and are never copied into this platform tree. A project may reference **several**
repositories, with roles, and work items state which repositories they touch.

## System modules

- **Core control plane (`apps/core`)** — Hono REST API, Commander CLI, front-office agent, intent
  triage, planner, model broker, agent runtime tools, evidence and quality-gate evaluation, and
  SQLite stores extending `BaseStore`.
- **Web operator UI (`apps/web`)** — Dashboard, chat, project/agent/settings section layouts, floating
  detail panels, and domain-partitioned API clients under `apps/web/src/lib/api/`.
- **Worker execution plane (`apps/worker`)** — the job runner leases work from Core; executors
  (`model-agent`, `echo`, `github`) run inside a sandbox; LLM-callable tools live in `src/tools/`,
  executors in `src/executor/`. See [Worker architecture](worker.md).
- **Contracts (`packages/contracts`)** — machine-readable interfaces validated by
  `npm run contracts:check`.

## Persistence

SQLite via Drizzle ORM. Domain stores (`AgentStore`, `PmStore`, `WikiStore`, …) extend `BaseStore` for
shared error codes and database access. Schema bootstrap and incremental migrations live in
`apps/core/src/persistence/migrations.ts`.

## Operator surfaces

Chat, CLI, and web must agree on the same resource ids and fields after a mutation, and no surface may
do something the others cannot. Section routes (`/projects`, `/agents`, `/settings`) use Next.js
`layout.tsx` for shared headers and sub-navigation. Entity details open as floating panels driven by
query params rather than deep standalone pages.

## Factory-shape constraints

Three properties of this architecture exist specifically so the factory can work on arbitrary
projects ([agnosticism invariants](../concepts/agnosticism-invariants.md)):

| Constraint | Why |
|-----------|-----|
| The toolchain is discovered, never assumed | Acceptance evidence derives from the project ([roadmap](../roadmap/03-quality-and-testing.md)) |
| A project is a set of repositories, not one | Multi-repo and monorepo shapes are first-class |
| Existing conventions outrank factory defaults | The factory writes into code it did not author |

## Related docs

- [Worker architecture](worker.md)
- [Agent hierarchy](agent-hierarchy.md)
- [Data ownership](data-ownership.md)
- [Repository strategy](repository-strategy.md)
- [Execution assurance](execution-assurance.md)
- [Security model](../security/security-model.md)
- [Core–worker protocol](../protocols/control-worker.md)
