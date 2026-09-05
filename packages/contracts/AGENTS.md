# packages/contracts agents

## English only

Follow the workspace language policy in `/AGENTS.md`.

Skill definitions in `skills/*.json` are injected into every agent prompt. Write `name`, `description`, and `promptFragment` in English only.

When authoring or reviewing skills:

- Use English for example task titles, error text, and workflow instructions inside `promptFragment`
- Keep slug identifiers ASCII (`workflow-questions`, not `flujo-preguntas`)
- Translate any legacy Spanish copy when touching a skill file
