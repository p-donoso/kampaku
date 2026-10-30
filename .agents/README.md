# Repository agent guidance

This directory is the source of truth for guidance used while developing the Kampaku repository. These
rules and skills help repository contributors; they are not capabilities shipped by the Kampaku product.

## Rules

Always follow [repository.md](rules/repository.md), [agent-operating-model.md](rules/agent-operating-model.md),
[branching-strategy.md](rules/branching-strategy.md), [english-only.md](rules/english-only.md), and
[eval-suites-required.md](rules/eval-suites-required.md). Apply [brand-mark.md](rules/brand-mark.md) when a task
touches its listed logo files:

- **Repository-wide rules** — platform scope, measured claims, local ports, docs, and secrets.
- **Operating model** — product boundaries and development invariants.
- **Branching** — branch and commit workflow.
- **English-only** — language policy for persisted artifacts.
- **Evaluation** — suite coverage and re-run requirements.
- **Brand mark** — logo source files and visual checks.

## Skills

Repository-specific reusable workflows belong under [skills/](skills/README.md). Do not place Kampaku
runtime skills there: those are product assets under `packages/contracts/skills/` and are governed by the
runtime catalog, mapping, documentation, and tests. The [Kampaku CLI skill](skills/kampaku-cli/SKILL.md)
covers local operator workflows for contributors. The [Kampaku evals skill](skills/kampaku-evals/SKILL.md)
covers running and scoring the product evaluation suites. The [Kampaku roadmap skill](skills/kampaku-roadmap/SKILL.md)
covers tracking roadmap deliverables in GitHub Projects.

## Scope and precedence

The root `AGENTS.md` is an index to this directory. A package-local `AGENTS.md` adds narrower instructions for
that package. Generated guidance such as `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` remains with the tool
that owns it.
