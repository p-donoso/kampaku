# Domain model

- **Project** — a governed unit of work with metadata and references to one or more external repositories.
- **Goal** — a durable expression of desired outcome, priority, constraints, and completion conditions.
- **Plan** — a versioned decomposition of a Goal.
- **Task** — a dependency-aware unit of planned work.
- **Job** — a schedulable execution attempt for a Task.
- **Run** — the observed runtime record of an agent or tool execution.
- **Agent** — a persistent role with policy, capabilities, instructions, and memory references.
- **Worker** — an execution host advertising capabilities and accepting leased Jobs.
- **Tool** — a bounded operation available under an explicit capability and policy.
- **Knowledge** — retrievable information with provenance, scope, freshness, and retention metadata.
