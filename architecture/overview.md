# Architecture overview

```text
User interfaces
      |
Gatekeeper / API
      |
Planner --- Librarian --- Model Broker
      |
Scheduler ---- Persistence
      |
Worker API
      |
Workers: executor + sandbox + tools
```

Kampaku separates a durable control plane from an isolated execution plane. Core owns intent, policy, planning, scheduling, knowledge metadata, and canonical state. Workers own bounded execution. Contracts define their shared language.

The system is designed to continue safely for hours, days, or weeks: every meaningful transition is durable; work is leased rather than assumed; retries are expected; privileged actions are policy-controlled; and humans can inspect, pause, redirect, or cancel work.
