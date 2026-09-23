# Kampaku workspace agents

## What this repository is

The platform for a **software factory**: the control plane, the workers, the operator UI, and the
contracts that a person points at their own repositories. It is not itself a product the factory
builds, and it is never a project's repository.

- Product statute: [`docs/product/software-factory.md`](docs/product/software-factory.md)
- Invariants: [`docs/concepts/agnosticism-invariants.md`](docs/concepts/agnosticism-invariants.md)
- Authority model: [`docs/eval/factory-contract.md`](docs/eval/factory-contract.md) and
  [`docs/adr/0005-factory-authority-model.md`](docs/adr/0005-factory-authority-model.md)
- Open gaps: [`docs/eval/results/BOARD.md`](docs/eval/results/BOARD.md)

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
- Acceptance criteria, wiki pages, journal templates, and planner output
- Tests that assert system-generated strings
- Structured `<kampaku-question>` prompts and boolean labels (`Yes`/`No`)

### Conversational chat only

Kampaku may reply in the emperor's language in live chat. Persisted or machine-readable output must
still be English.

**Declared exception:** the capability-probe run records under `docs/eval/` quote live operator turns
in the language they occurred in, because rewriting them would destroy the evidence. They carry a
language note explaining this. New documents are English-only.

### Before finishing any change

Scan your diff for Spanish diacritics (`áéíóúñ¿¡`) or common words like `Eliminar`, `Descripción`,
`proyecto`, `tarea`, `servidor`, `Cargando`.

See also `.cursor/rules/english-only.mdc` and package-specific `AGENTS.md` files.

## Working in this repository

- The platform's own conventions (npm workspaces, TypeScript, Vitest, Playwright) apply **to this
  repository only**. Nothing built here may assume that a managed project uses them
  ([invariants](docs/concepts/agnosticism-invariants.md)).
- Never write a scaffold, a skill, or a prompt that names a specific vendor, demo project, or stack as
  a default.
- A stored value that could have been measured is a claim: verify it or label it unverified
  ([principles](docs/development/principles.md) § 9).
- When you change `KAMPAKU_BUILTIN_DEFINITION.tools`, check
  `apps/core/src/agents/runtime/session.ts` — the tool list is filtered by that array, so a prompt that
  names a tool which is not listed produces an unreachable instruction. That exact mismatch is
  [BOARD F-001](docs/eval/results/BOARD.md).

## Operator-local details

Operator-specific infrastructure (personal model routers, local voice stacks, credentials paths) does
not belong in this tree. Keep run parameters in the eval run record that needs them, and keep secrets
out of the repository.
