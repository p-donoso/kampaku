# English only

Write and maintain all Kampaku workspace content in English:

- Agent names, slugs, responsibilities, and system prompts
- Skills, docs, ADRs, comments, commit messages, and PR descriptions
- UI copy, error messages, and API user-facing strings
- Agent rules and project documentation
- Task titles, wiki pages, journal entries, and planner/delegator stub output
- Test fixtures that represent system-generated content

Do not introduce Spanish (or other languages) in code, configs, or docs unless explicitly requested for localization work.

When editing existing Spanish text, translate it to English as part of the change.

## Applies to all agents

- **Repository agents** editing this repo — follow this rule on every change
- **Kampaku runtime agents** — see `apps/core/src/agents/definitions.ts` and `DEFAULT_GLOBAL_SYSTEM_PROMPT`
- **Skill authors** — see `kampaku-contracts/AGENTS.md`

Conversational chat with the emperor may use their language; persisted artifacts must stay English.

## Quick check before commit

Search your diff for `áéíóúñ¿¡` or strings like `Eliminar`, `Descripción`, `Cargando`, `proyecto`, `tarea`.
