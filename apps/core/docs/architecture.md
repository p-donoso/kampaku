# Core architecture

Kampaku Core is a modular, event-driven control plane. External clients interact via the Hono HTTP API and TypeScript client libraries. The Intent Delegator and Project Management layer decompose goals into executable work-item graphs; the Scheduler leases ready jobs to registered workers. Results and journal events return through the API and are persisted durably before influencing subsequent execution.

```text
Client / Web UI
      |
HTTP API (Hono) -> Delegator / PM -> Scheduler -> Worker Plane
      |                   |              |
      +------------ BaseStore -----------+
                          |
                    Model Broker
```

## Architectural layers

1. **Persistence Layer (`src/persistence/`)**:
   - `BaseStore`: Abstract base class providing common database connection and transaction handling.
   - Domain Stores: `PmStore`, `AgentStore`, `ConversationStore`, `SkillStore`, `MemoryStore`, `QuestionStore`, `BlockageStore`, `JournalStore`, and `WikiStore`.
   - `migrations.ts`: Modular, incremental SQLite migrations decoupled from ORM schema definitions.
2. **Client Abstraction (`src/client/`)**:
   - `BaseHttpClient`: Standardized fetch wrapper with JSON serialization, status handling, and typed error responses (`CoreClientError`).
   - `CoreClient`: Full control-plane API client for terminal CLI and worker execution.
3. **Agent Runtime & Tools (`src/agents/runtime/`)**:
   - `BaseTool`: Abstract specification for OpenAI function-calling tools.
   - Model-agnostic runtime tool execution with role-based scoping and authorization checks.
4. **Test Harness (`tests/helpers/`)**:
   - `createTestContext`: Standardized test fixture factory providing isolated temporary directories, in-memory/on-disk SQLite databases, and initialized stores.

## Core rules

1. State transitions are durable, explicit, and auditable.
2. Workers execute jobs but do not own project truth.
3. Contracts crossing repository or process boundaries live in `packages/contracts`.
4. Provider-specific model behavior is contained behind the Model Broker.
5. All workspace artifacts, code, comments, and documentation must adhere to English-only policy.
