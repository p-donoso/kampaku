# kampaku-core agents

## English only

Follow the workspace language policy in `/AGENTS.md`.

When editing this package, keep **all** user-facing and persisted strings in English:

- CLI output (`src/cli/`)
- Delegator stub plans and coherence documents (`src/delegator/`)
- Agent definitions (`agents/*.agent.json`) and tool messages
- Default global system prompt (`src/application/settings/global-system-prompt.ts`)
- API error messages returned to the web UI

Runtime agents load `DEFAULT_GLOBAL_SYSTEM_PROMPT` and skill `promptFragment` values at execution time. Do not introduce Spanish in those sources.

Conversational Kampaku replies may match the emperor's language; structured artifacts (questions, tasks, wiki) must not.
