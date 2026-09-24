# ADR-0006: A project lead may create the seats it proposes

- Status: Accepted
- Date: 2026-09-24
- Supersedes: nothing. Narrows and completes [ADR-0005](0005-factory-authority-model.md)'s authority model.
- Related: [BOARD F-021](../eval/results/BOARD.md), [F-023](../eval/results/BOARD.md),
  [roadmap 08](../roadmap/08-project-agent-roster.md), [roadmap 07](../roadmap/07-engineering-skills.md)

## Context

[Roadmap 08](../roadmap/08-project-agent-roster.md) states the authority flow:

> 2. The project lead reads the project context and proposes the roster required by the repository,
>    objective, modules, and risks.
> 3. The lead creates or requests agents and sub-agents with bounded responsibilities and reporting
>    lines.

**Neither step works.** Measured in `apps/core/src/agents/runtime/tools/index.ts` on 2026-09-24:

`create_sub_agent` authorizes an actor holding `system-agent-roster` **or**
`workflow-specialist-delegation`, then requires the requested parent to be the actor itself or a
descendant of it (`assertSubAgentParentScope`).

A project lead's skill set comes from `PROJECT_TEAM_SKILL_MAP`'s `-lead` entry:
`system-delegation`, `system-plan-quality`, `docs-writer`, `workflow-blockers`. It holds **neither**
authorizing skill. Meanwhile the specialists the lead is supposed to create receive
`workflow-specialist-delegation` and therefore **can** create agents.

So the authority is inverted: the role that owns team formation cannot perform it, and the roles it
manages can. A lead that proposes a roster cannot build it, and nothing in the system reports the
failure — it surfaces as a plan that names agents which were never created, which is the
[F-006](../eval/results/BOARD.md) shape (a claim the tree contradicts).

## Decision

**A project lead may create sub-agents within its own subtree, without holding a delegation skill.**

The authorization for `create_sub_agent` becomes:

1. The actor holds `system-agent-roster` or `workflow-specialist-delegation` (unchanged), **or**
2. The actor is the linked lead of at least one project.

Both paths still require the existing `assertSubAgentParentScope` check: an agent may only create
sub-agents under itself or its descendants. Neither path lets an agent create a peer, a superior, or
anything outside its subtree.

### Why the condition is "leads a project" and not a new skill

The alternative was to add a delegation skill to the `-lead` entry of `PROJECT_TEAM_SKILL_MAP`. That
was rejected: `PROJECT_TEAM_SKILL_MAP` assigns capabilities by **slug suffix**, which
[roadmap 07](../roadmap/07-engineering-skills.md) exists to remove, and
[invariants §2](../concepts/agnosticism-invariants.md) forbid relying on a naming convention for
identity. Fixing an authorization hole by deepening the mechanism scheduled for deletion would leave
the hole and add debt.

The condition uses data that already exists and is already authoritative:
`ProjectRecord.projectLeadAgentId`, the same field `isAgentProjectOwner` in
`tools/authorization.ts` uses to decide work-item mutation scope. Team formation is a project-level
act, so a project-level fact is the right thing to read.

## Consequences

### Positive

- The documented flow in 08 becomes executable, and the inversion disappears.
- The widening is **one capability for one role class**: create a sub-agent under yourself, if you
  lead a project. Nothing else changes.
- It removes an incentive to widen the suffix map, which 07 is trying to delete.

### Negative

- A project lead gains a mutation it did not have. It is narrow — the parent-scope check still bounds
  it to the lead's own subtree — but it must be re-defended by the existing scope test rather than by
  absence, exactly as [ADR-0005](0005-factory-authority-model.md) required of `create_project`.
- An operator who linked a lead to a project by accident grants that agent team-forming authority.
  Mitigated by the parent-scope check: the agent can only add beneath itself.

### Neutral

- `system-agent-roster` keeps its meaning: it authorizes roster work *outside* a project the actor
  leads, which is what the platform's own `kampaku-manager` needs.
- Specialists keep `workflow-specialist-delegation` and their existing ability to create sub-agents.
  This ADR does not narrow them; the boundary's *shape* is unchanged and only the lead's path is added.

## Alternatives considered

**Give the `-lead` suffix the `workflow-specialist-delegation` skill.** Rejected: it fixes the symptom
inside the mechanism 07 is deleting, and it also grants the lead `submit_intent` and
`update_work_item` through that skill, which it already holds via `system-delegation`. No new
capability, more coupling.

**Give the `-lead` suffix `system-agent-roster`.** Rejected for the same reason, and worse:
`system-agent-roster` is the platform's catalog-only roster skill, so project leads would hold a
platform capability whose scope they cannot see.

**Remove the skill gate entirely and authorize on parent scope alone.** Rejected: it would let any
agent in any project create agents within its own subtree, widening authority far beyond the
documented flow. The gate exists for a reason; the defect was that one legitimate role was missing
from it.

**Change 08 to say the front office creates all agents.** Rejected: the front office does not have
the project context needed to decide which responsibilities exist, which is the reason 08 gives the
lead that job in the first place.

## Enforcement

The boundary must be locked in **both** directions, as
[eval-orchestrator-contract.test.ts](../../apps/core/tests/eval/eval-orchestrator-contract.test.ts)
does for the front office:

- **Allowed:** a project lead creates a sub-agent under itself, and the agent exists afterwards.
- **Denied:** an agent that leads no project and holds no delegation skill is refused.
- **Denied:** any agent, including a lead, creating under a parent outside its own subtree.
- **Denied:** the front office keeps exactly its allowlist; this ADR adds nothing to it.

## Related

- [BOARD F-021](../eval/results/BOARD.md) — the measured gap this resolves
- [BOARD F-023](../eval/results/BOARD.md) — the same family: a capability that depends on guessing a name
- [ADR-0005](0005-factory-authority-model.md) — the front-office boundary this leaves intact
- `apps/core/src/agents/runtime/tools/index.ts`, `apps/core/src/agents/runtime/tools/authorization.ts`
