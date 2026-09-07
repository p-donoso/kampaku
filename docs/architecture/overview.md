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
      Workers: Executor + Sandbox + Tools
```

Kampaku separates a durable control plane from an isolated execution plane. Core owns intent, policy, planning, scheduling, knowledge metadata, and canonical state. Workers own bounded execution. Contracts define their shared language.

The system is designed to continue safely for hours, days, or weeks: every meaningful transition is durable; work is leased rather than assumed; retries are expected; privileged actions are policy-controlled; and humans can inspect, pause, redirect, or cancel work.

## System modules

- **Core Control Plane (`apps/core`)**: Implements durable state management (`BaseStore`), REST API routes, delegator and task scheduling, agent runtime loops, and the model broker.
- **Web Frontend (`apps/web`)**: Next.js dashboard and conversational workspace with domain-partitioned API client modules (`apps/web/src/lib/api/`).
- **Worker Execution Plane (`apps/worker`)**: Bounded worker processes executing leased jobs with model sandboxing and tool execution.
- **Contracts (`packages/contracts`)**: Shared schemas, protocol specifications, and skill catalogs.
