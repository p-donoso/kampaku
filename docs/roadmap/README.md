# Software-factory roadmap

This directory contains the roadmap's stable deliverable specifications: product direction, context,
scope, rationale, and acceptance criteria. **Active delivery tracking lives in the private
[Kampaku Roadmap Project](https://github.com/users/p-donoso/projects/2).**

## Sources of truth

| Information | Source |
|-------------|--------|
| Active status, readiness, priority, owner area, dependencies, and schedule | [Kampaku Roadmap Project](https://github.com/users/p-donoso/projects/2) |
| Product rationale, scope, design, and definition of done | The linked deliverable specification in this directory |
| Evaluation results and product gaps | [Suite protocols](../eval/README.md) and the [evaluation board](../eval/results/BOARD.md) |
| Evaluation handoff | [`docs/eval/NEXT-SESSION.md`](../eval/NEXT-SESSION.md) |

Do not mirror project status or ordering in this README or in deliverable metadata. Keep technical
acceptance criteria in the specification; track their active delivery state in the Project.

## Resume

For roadmap work, select an issue in the Project, read its linked specification, and use the
[roadmap skill](../../.agents/skills/kampaku-roadmap/SKILL.md) to update tracking. Change a specification
through a reviewed repository change. Close the Project issue only when its acceptance criteria and
required evidence are satisfied.

For evaluation work, follow the [evaluation handoff](../eval/NEXT-SESSION.md), suite files, and board.
Evaluation-suite progress is not roadmap status.

## Stable IDs

Deliverable numbers are permanent identifiers, not a sequence. Never renumber or reuse them: board rows,
issues, and commits may cite them.

`01`, `02`, and `05` are retired and will not be reused:

| ID | Former topic | Current home |
|----|--------------|--------------|
| `01` | Product philosophy | The nine principles in the [statute](../product/software-factory.md) § Permanent principles |
| `02` | Factory flow | The line and gates in the [statute](../product/software-factory.md) |
| `05` | Adoption sequence | Active delivery order is tracked in the [Kampaku Roadmap Project](https://github.com/users/p-donoso/projects/2) |

## Deliverable specifications

| ID | Specification | Topic |
|----|---------------|-------|
| 03 | [Quality and testing](03-quality-and-testing.md) | Derived, persisted, package-scoped acceptance evidence |
| 04 | [Capability program](04-capability-program.md) | Factory capabilities and gates |
| 06 | [Project context](06-project-context.md) | Shared context exposed by a project |
| 07 | [Engineering skills](07-engineering-skills.md) | Stack-neutral programming capabilities |
| 08 | [Project agent roster](08-project-agent-roster.md) | Project-scoped agents, hierarchy, and memory |
| 09 | [Domain-model naming](09-domain-model-naming.md) | Compatibility-aware model vocabulary |
| 10 | [Context minimization](10-context-minimization.md) | Bounded context projections and on-demand queries |
| 11 | [Multi-provider routing](11-multi-provider-routing.md) | Endpoint contract and staged routing |
| 12 | [Measurement program](12-measurement-program.md) | Run suites and reconcile the roadmap with evidence |
| 13 | [Evidence decay](13-evidence-decay.md) | Keep verdicts meaningful as artifacts change |
| 14 | [Operator attention](14-operator-attention.md) | Decision load and operator experience |
| 15 | [Reversal and retraction](15-reversal-and-retraction.md) | Correct outcomes found wrong after closure |
| 16 | [Prohibited operations](16-prohibited-operations.md) | Enforce operations that are out of bounds |
| 17 | [AI interaction expertise](17-ai-interaction-expertise.md) | Prompts, skills, and model-call cost in built software |
| 18 | [Self-extension](18-self-extension.md) | Author agents and skills beyond the seed set |

Use [`00-template.md`](00-template.md) for new deliverable specifications.

## Where policy lives

Policies describe standing product properties. Keep them with the product documentation and link to them
from deliverable specs instead of copying their rules here.

| Policy | Canonical document |
|--------|--------------------|
| Deliverable, principles, factory line, gates, and refused work | [Software-factory statute](../product/software-factory.md) |
| Token budgets and call accounting | [Token economy](../concepts/token-economy.md) |
| Verification and closure rules | [Execution assurance](../architecture/execution-assurance.md) |
| Prohibited and gated operations | [Security model](../security/security-model.md) |
| Software scope and agnosticism | [Agnosticism invariants](../concepts/agnosticism-invariants.md) |

## Historical consolidation notes

The earlier roadmap consolidation recovered these items into owners; this mapping is historical context, not
active tracking:

- Multi-worker capacity, schedules, and budgets — [04](04-capability-program.md) § Capacity and cost.
- Per-work-order cost accounting — [04](04-capability-program.md), using per-attempt usage from [11](11-multi-provider-routing.md).
- Automated prompt harness — explicitly out of scope in the [evaluation guide](../eval/README.md).
- Running the suite battery — [12](12-measurement-program.md).
- Workspace retention and durable-store backup/export — [04](04-capability-program.md) § Capacity and cost.
- Project development process — [06](06-project-context.md) and [16](16-prohibited-operations.md).

The framing-alignment delivery closed on 2026-09-24; its evidence and dispositions are in
[evaluation learnings](../eval/results/LEARNINGS.md).

## Roadmap integrity

- A deliverable is finite work with an observable outcome and a definition of done.
- A closed board gap is not a green evaluation suite; each keeps its own evidence and status.
- Do not weaken suite gates or broaden Kampaku beyond software work to make a deliverable appear complete.
- New work needs a stable-ID specification and a linked Project issue. Keep active status, owner, priority,
  dependencies, and ordering in the Project.
