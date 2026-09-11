# Kampaku workspace agents

## FreeLLMAPI

Ops live in `/home/pdonoso/freellmapi/` (not this monorepo). After context loss start at `docs/STATE.md`.

- Skill: `freellmapi` (`~/.agents/skills/freellmapi/`)
- Learnings: `docs/LEARNINGS.md` · Routing: `docs/ROUTING.md` · Log: `KEY_ACQUISITION_LOG.md`
- Provider Google: **only** `kampaku.ai@gmail.com` (never personal Gmail)
- Secrets: `/home/pdonoso/freellmapi/.secrets.env` · Container: `freellmapi` `:3001` · Env: `FREELLMAPI_*` here

## Language policy (mandatory)

All workspace artifacts must be written in **English** unless explicitly requested for localization work.

This applies to every agent working in this monorepo:

| Agent kind | Examples |
|------------|----------|
| Cursor IDE agents | Editing `apps/web`, `apps/core`, `apps/worker`, docs |
| Kampaku runtime agents | Kampaku, sub-agents, worker executors |
| Skill catalog authors | Agent Skills in `packages/contracts/skills/*/SKILL.md` |

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

See also `.cursor/rules/english-only.mdc` and package-specific `AGENTS.md` files.
