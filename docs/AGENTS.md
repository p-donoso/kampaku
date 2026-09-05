# Kampaku workspace agents

## Language policy (mandatory)

All workspace artifacts must be written in **English** unless explicitly requested for localization work.

This applies to every agent working in this monorepo:

| Agent kind | Examples |
|------------|----------|
| Cursor IDE agents | Editing `kampaku-web`, `kampaku-core`, `kampaku-worker`, docs |
| Kampaku runtime agents | Kampaku, sub-agents, worker executors |
| Skill catalog authors | JSON in `kampaku-contracts/skills/` |

### Always English

- UI copy, labels, placeholders, buttons, aria-labels, and error messages
- Code comments, commit messages, PR descriptions, ADRs, and docs
- Task titles, acceptance criteria, wiki pages, journal templates, and planner stub output
- Tests that assert system-generated strings
- Structured `<kampaku-question>` prompts and boolean labels (`Yes`/`No`)

### Conversational chat only

Kampaku may reply in the emperor's language in live chat. Persisted or machine-readable output must still be English.

### Before finishing any change

Scan your diff for Spanish diacritics (`áéíóúñ¿¡`) or common words (`Eliminar`, `Descripción`, `proyecto`, `tarea`, `servidor`, `Cargando`).

See also `.cursor/rules/english-only.mdc` in this repo and package-specific `AGENTS.md` files.
