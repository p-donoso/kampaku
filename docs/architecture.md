# Core architecture

Kampaku Core is a modular control plane. External clients enter through the API and Gatekeeper. The Planner produces durable task graphs; the Scheduler leases ready work to registered workers. Results and events return through the API and are persisted before they can influence subsequent planning.

```text
Client -> API -> Gatekeeper -> Planner -> Scheduler -> Worker
                    |             |          |
                    +------ Persistence -----+
                              |
                         Librarian
                              |
                         Model Broker
```

## Initial architectural rules

1. State transitions are durable, explicit, and auditable.
2. Workers execute jobs but do not own project truth.
3. Contracts crossing repository or process boundaries live in `kampaku-contracts`.
4. Secret values are held by an external secret store; the database keeps references only.
5. Provider-specific model behavior is contained behind the Model Broker.
6. Managed projects are database entities referencing external repositories; they are never copied into this source tree.

## First implementation slice

The smallest useful vertical slice is: register a Project, create a Goal, produce one Task, lease a Job to one Worker, accept a Result, and expose the resulting audit trail.
