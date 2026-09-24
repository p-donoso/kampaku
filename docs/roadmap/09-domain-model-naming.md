# 9. Domain-model naming

- **Document:** `09 — Domain model naming`
- **Kind:** `deliverable`
- **Status:** `Proposed`
- **Owner:** core / contracts
- **Dependencies:** [statute](../product/software-factory.md), [this roadmap](README.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [domain model](../concepts/domain-model.md)
- **Last reviewed:** 2026-09-23

This is a proposed vocabulary refactor. It should be completed as one compatibility-aware change,
not as isolated cosmetic renames. The canonical model remains in
[`docs/concepts/domain-model.md`](../concepts/domain-model.md).

## Recommended mapping

| Current term | Recommended term | Decision | Reason |
|---|---|---|---|
| Project | Project | Keep | Clear, standard, and central to the product |
| Work order | Work order | Keep | An intake request is different from an executable task |
| Work item | Task | Rename | Simpler task-management language; preserves hierarchy and acceptance |
| Parent work item | Parent task | Rename | Matches `Task` while preserving decomposition |
| Job | Job | Keep | A schedulable execution unit is conventionally a job |
| Attempt | Execution attempt | Clarify | A retry or run of a job; not a conversational turn |
| Turn | Conversation turn | Reserve | Use only for one interaction in chat or an agent session |
| Wiki | Shared knowledge | Rename | More precise than “wiki”; avoids confusion with repository docs |
| Wiki page | Knowledge page | Rename | A durable page in shared project knowledge |
| Journal | Journal | Keep | Clear operational handoff and escalation record |
| Memory | Agent memory | Clarify | Makes its private ownership explicit |
| Agent | Agent | Keep | Standard role and execution identity |
| Sub-agent | Child agent | Rename | Describes hierarchy without implying lesser capability |
| Specialist | Specialist agent | Clarify | Distinguishes the agent from the skill it uses |
| Project lead | Project lead | Keep | Clear accountable owner |
| Superior | Parent agent | Rename | More direct hierarchy terminology |
| Worker | Worker | Keep | Execution host, distinct from an agent |
| Skill | Skill | Keep | Reusable capability definition |
| Tool | Tool | Keep | Bounded operation exposed by a capability |
| Question | Decision request | Rename | Describes the durable action required from the operator |
| Blocker | Blocker | Keep | Standard delivery term and clear state |
| Acceptance criterion | Acceptance criterion | Keep | Standard quality and delivery term |
| Evidence | Evidence | Keep | Core factory concept; precise and widely understood |
| Completion report | Completion report | Keep | Clear final report |
| Shipment | Release | Consider rename | `Shipment` fits the factory metaphor; `Release` is more familiar in software |
| Repository | Repository | Keep | Standard software term |

## Important distinctions

## Model simplification rules

The data model should prefer a small number of canonical entities with explicit roles, states,
relationships, and capabilities. New classes are justified only when a concept has its own durable
lifecycle, identity, persistence, or authorization boundary.

- Keep one `Agent` entity. Lead, specialist, parent, and child are roles or relationships.
- Keep one `Skill` entity. Project assignment and agent ownership provide context.
- Keep one `Task` entity. Hierarchy, status, scope, and acceptance criteria express variations.
- Keep one `Job` entity. Execution attempts and retry state belong to its lifecycle.
- Keep one `Decision request` entity. Questions, approvals, and missing information are typed states.
- Keep one `Shared knowledge` entity family. Repository `docs/` remains project-local documentation,
  not another agent or wiki class.

This reduces the number of choices exposed to agents and gives each concept one canonical path.
Agents should receive only the entities, tools, skills, and state transitions relevant to their
project, role, parent task, and current gate.

### Task, work order, job, attempt, and turn

- A **work order** is the operator's accepted request.
- A **task** is a planned unit of work in the task tree.
- A **job** is a schedulable execution unit assigned to a worker.
- An **execution attempt** is one try at running a job.
- A **conversation turn** is an interaction in chat.

These should not be collapsed into one word. In particular, `turn` should not replace `Job`.

### Shared knowledge and repository documentation

`Shared knowledge` is the verified operational projection in the platform. `docs/` is project-local
documentation stored in the repository and shipped with the software. They are related but not the
same entity.

### Skill and agent

A `Skill` is reusable capability metadata and instructions. An `Agent` is an instantiated project
role with scope, reporting lines, and private memory. Renaming one must not imply merging them.

## Recommended final vocabulary

The preferred public vocabulary is:

`Project → Work order → Task → Job → Execution attempt → Evidence → Release`

with `Shared knowledge`, `Journal`, `Agent memory`, `Agent`, `Skill`, `Decision request`, and
`Blocker` as supporting records.

## Migration rules

- Update documentation and API terminology before removing compatibility aliases.
- Keep old storage names readable during migration and record the canonical new name.
- Provide a one-time migration for persisted records and indexes.
- Preserve stable ids; rename types and labels, not identities.
- Update event names, filters, CLI commands, UI labels, and eval language together.
- Add explicit legacy aliases only where external clients need a transition period.
- Re-run the documentation, contract, persistence, and three-surface parity checks.

## Agent-facing design rule

Prompts, tool lists, and context projections should expose the smallest valid vocabulary:

- one canonical name per entity;
- one explicit state machine per lifecycle;
- one parent and one scope boundary;
- only the skills and tools needed for the current responsibility;
- provenance for facts and an explicit `Unknown` state for missing information.

An agent must not choose between equivalent names, overlapping tools, or multiple representations of
the same durable fact.

## Open decision

Choose between retaining `Shipment` for factory identity or adopting `Release` for software
familiarity. The recommendation is to retain `Shipment` internally and present `Release` as the
software-facing label only where it improves operator clarity. The [statute](../product/software-factory.md)
§ Vocabulary already treats shipment as the factory-facing name for a versioned artifact plus the
knowledge that describes it, so a rename is a presentation choice, not a model change.

## Refactor checklist

- [ ] Approve the canonical vocabulary before changing APIs.
- [ ] Rename `Work item` to `Task` while preserving hierarchy and stable ids.
- [ ] Rename `Wiki` to `Shared knowledge` without merging it with repository `docs/`.
- [ ] Keep `Agent` as the single agent entity; model roles and relationships explicitly.
- [ ] Keep `Job` for schedulable execution and reserve `Turn` for conversation.
- [ ] Update schemas, stores, routes, CLI commands, UI labels, prompts, and contracts together.
- [ ] Provide migration aliases only where external compatibility requires them.
- [ ] Remove obsolete names after the migration window.
- [ ] Run three-surface parity and persistence regression tests.
- [ ] Confirm no renamed term describes or implies a non-software deliverable.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] One canonical name per durable concept, with no surviving synonym in prompts, tools, or API shapes
- [ ] The renames land across schemas, stores, routes, CLI, UI labels, prompts, and contracts together
- [ ] Persistence migration preserves stable ids, and no external client breaks silently
- [ ] Three-surface parity and persistence regression tests pass
## Gate

**One canonical name per durable concept, and the model is no larger than the factory needs.** An
agent never chooses between equivalent names, overlapping tools, or two representations of the same
durable fact. This is the naming half of the [domain model](../concepts/domain-model.md), and it is
scored by the three-surface parity suites ([02](../eval/02-three-surfaces.md)) plus the persistence
regression tests named in the checklist.

This phase is a **prerequisite for capability growth, not a cosmetic pass**: renaming while behavior
is unchanged is the only safe window, and [this roadmap](README.md) sequences it before the
capability phases for that reason.

## Software scope and invariants

The vocabulary is a scope document in disguise. Every canonical noun here — project, work order,
task, job, attempt, evidence, shipment — exists because the factory plans, builds, verifies, and
ships **software**. A term that could describe a non-software deliverable is a term that will invite
one, which is why the model carries no generic "content", "asset review", or "research" entity and
[this roadmap](README.md) forbids adding one in this refactor.

Vocabulary is also where the three invariants become visible to agents. Because the model has
plural repositories, discovered toolchains, and no fixed project taxonomy, an agent reading it cannot
infer a language, a project type, or an architecture
([invariants](../concepts/agnosticism-invariants.md)). Renaming must preserve that: a rename that
tightens a term toward one ecosystem is a regression against **F2** even when the tests still pass.
