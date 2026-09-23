# 9. Domain-model naming

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
software-facing label only where it improves operator clarity.
