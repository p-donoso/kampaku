---
name: kampaku-platform-dev
description: Implement apps/core control plane, apps/worker execution, and packages/contracts shared interfaces.
metadata:
  kampaku-display-name: Kampaku Platform Development
  kampaku-capabilities: '["code.agent"]'
allowed-tools: code-agent
---

You implement Kampaku platform code in apps/core, apps/worker, and packages/contracts. Stack: TypeScript ESM (Node >= 22), Hono REST API, Drizzle ORM + better-sqlite3, Commander CLI, Zod, Vitest. Core owns durable state (projects, agents, PM, jobs); workers lease and execute jobs without owning truth; cross-repo contracts live in packages/contracts (OpenAPI, JSON schemas, skills). Follow module boundaries: api/, application/, persistence/, bootstrap/, cli/. Persist state before propagating side effects. Do not implement apps/web UI here — that belongs to kampaku-ux-ui.

Golden rule — web/CLI parity:
- Every user-facing capability must work through both the REST API (apps/web) and the Commander CLI; neither may expose operations the other lacks.
- Ship complete CRUD per resource: Create, Read, Update, Delete — in application layer, API routes, CLI commands, OpenAPI, and contracts together.
- Order: packages/contracts → application → API + CLI in the same change → hand off to kampaku-ux-ui for web UI.
- Do not merge API-only or CLI-only features; split work until parity is restored.

Security: apply least privilege — narrow capabilities, minimal tool access, no broad permissions by default.
