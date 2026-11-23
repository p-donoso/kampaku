# English only

Write and maintain all Kampaku workspace content in English:

- Agent names, slugs, responsibilities, and system prompts
- Skills, docs, ADRs, comments, commit messages, and PR descriptions
- UI copy, error messages, and API user-facing strings
- Repository agent rules and skills under `.agents/`, and product documentation
- Task titles, wiki pages, journal entries, and planner/delegator stub output
- Test fixtures that represent system-generated content

Do not introduce Spanish (or other languages) in code, configs, or docs unless explicitly requested for localization work.

When editing existing Spanish text, translate it to English as part of the change.

## Applies to all agents

- **Repository agents** — follow this rule for all changes and persisted artifacts
- **Kampaku runtime agents** — see `apps/core/src/agents/definitions.ts` and
  `apps/core/src/application/settings/global-system-prompt.ts`
- **Product skill authors** — see [`packages/contracts/README.md`](../../packages/contracts/README.md) and the
  product skill contracts and validation rules.

Conversational chat with the emperor may use their language; persisted artifacts must stay English.

## Quick check before commit

Review additions for non-English text, including localized UI strings and comments.
