# 8. Project agent roster

- **Document:** `08 — Project agent roster`
- **Kind:** `deliverable`
- **Status:** `Ready`
- **Owner:** core / contracts
- **Dependencies:** [01](01-philosophy.md), [07](07-engineering-skills.md), [18](18-self-extension.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [agent hierarchy](../architecture/agent-hierarchy.md), [eval 03](../eval/03-stations-and-staffing.md)
- **Last reviewed:** 2026-09-23

## Two different things

### Skill catalog

A reusable catalog of capabilities and instructions: programming, testing, UX/UI, security, data,
operations, legal and compliance, and other project-relevant expertise. A skill has no project
memory and does not own work by itself.

### Project agent roster

The instantiated team for one project. Each agent uses one or more skills, has a responsibility,
reports to a parent, receives project and module context, and owns private memory for its work.

The same skill may be used by multiple agents. Those agents are not interchangeable: their memory,
scope, decisions, and context remain separate.

## The seat

An agent instance is a **seat**: a role bound to a scope, holding a skill set, reporting to a parent.
The word is useful because it names what the instance *is* — and because the thing it replaces was
implicit.

A seat is **not a new entity.** It is the name for the fields an `Agent` instance must carry
explicitly. [09](09-domain-model-naming.md) requires keeping one `Agent` entity with roles and
relationships as data, and a parallel class with its own lifecycle would be the "equivalent entity"
the phase template forbids. So:

| Seat attribute | Why it exists |
|----------------|---------------|
| **role** | What this seat answers for. Data, not a naming convention |
| **scope** | Project, plus the module or repository the seat works in. Two seats of the same role in different modules are different seats |
| **skills[]** | The capabilities *this* seat needs, not the ones its name suggests |
| **parentId** | Who it reports to. Already implemented and working |
| **provenance** | Why the seat was created, and from what evidence |

### What the implementation does today, and why that is the gap

Measured 2026-09-24 against `apps/core/src`:

| Question the seat should answer | How it is answered now |
|--------------------------------|------------------------|
| Which project does this agent belong to? | **Not on the agent.** `AgentRecord` has no `projectId`; the project points at its lead (`projectLeadAgentId`) and everything else is assumed to descend from it |
| What role is it? | By **slug suffix** (`-qa`, `-frontend`, `-backend`) |
| Which skills does it get? | By **slug suffix**, in `PROJECT_TEAM_SKILL_MAP`. A name outside the list receives **no skills at all** |
| What module does it work in? | **Not expressed.** Nothing distinguishes two agents of the same role in two modules except their names |

The consequence is that a seat's identity depends on somebody naming it correctly, and the same
question — *what is this agent and what may it do?* — is answered in **three** places with three
incompatible rules: `PLATFORM_TEAM_TREE` (hand-written prompts), `PROJECT_TEAM_SKILL_MAP` (suffix →
skills), and `agent-scope.ts` (`PLATFORM_ROLE_SUFFIXES` plus `FRONTEND_HINT_WORDS` /
`BACKEND_HINT_WORDS`, which still carry vocabulary from one past run). That is the over-complexity
this phase removes, not the seat model.

### What the seat deliberately is not

- **Not a cloneable template.** A clone would carry a stale prompt and start with empty memory anyway,
  and the prompt is synthesised per instance from responsibility plus assigned skills. Reuse lives in
  the skill catalog; copying an agent adds a divergent duplicate with no owner.
- **Not a per-agent journal.** The journal anchors to `projectId` + `workItemId` with
  `fromAgentId` / `toAgentId` as attribution, which is correct for handoffs. Only memory is private to
  a seat.

## Authority flow

1. Kampaku receives and accepts the work order, identifies the responsible project lead, and
   delegates the project session.
2. The project lead reads the project context and proposes the roster required by the repository,
   objective, modules, and risks.
3. The lead creates or requests agents and sub-agents with bounded responsibilities and reporting
   lines.

> **Steps 2–3 were broken and are now fixed.** Measured 2026-09-24: `create_sub_agent` authorized an
> actor holding `system-agent-roster` or `workflow-specialist-delegation`, and a project lead held
> neither — so the lead could not create the seats it proposed, while the specialists it managed could.
> The authority was inverted relative to this document ([BOARD F-021](../eval/results/BOARD.md)).
> [ADR-0006](../adr/0006-project-lead-creates-seats.md) resolves it: a project lead may create
> sub-agents bounded to its own subtree, authorized by `projectLeadAgentId` rather than by a delegation
> skill. What remains open is the *shape* of the seat — role, module scope, and skills derived from
> discovered aspects rather than from the slug — which is this phase's checklist below.
4. Agents plan and execute within their project, parent work item, skill, and sandbox boundaries.
5. The lead coordinates the team and escalates decisions, blockers, and staffing changes.

Kampaku is the front office and does not directly design every project team. The lead owns team
formation because the lead has the project context needed to decide which responsibilities exist.

## Example

A project with two independent modules may instantiate:

- `ux-ui-module-a`, using the UX/UI skill and module A context;
- `ux-ui-module-b`, using the UX/UI skill and module B context.

They share capability definitions but not private memory or ownership. A lead may add a shared
reviewer when the modules need a cross-module consistency check.

### The shipped roster and catalog are a seed, not a taxonomy

The agents and skills that ship in `packages/contracts/skills/` and `PLATFORM_TEAM_TREE` are a
**starting set**: the initial stations the factory knows about, offered as suggestions. They are not
an enumeration of the roles that exist, and they are not a closed list.

- **A project is staffed from its own evidence**, not from the seed set. A repository containing
  prompts, a schema, a pipeline, an embedded target, or a compatibility surface gets a seat for that
  aspect whether or not a skill already exists for it.
- **When nothing in the catalog fits, the factory authors what it needs** — a new skill, a new seat,
  or both. That path is specified in [18](18-self-extension.md), because a seed set that cannot grow
  is a taxonomy in disguise and would fail the second project that does not resemble the first.
- **Adding a capability is data, not a code path.** This is [invariants §1](../concepts/agnosticism-invariants.md)'s
  rule for toolchains, applied to skills and stations: a new role must be authorable without editing
  the delegator's business logic.

The seed set is therefore measured on two things only: whether it covers the platform's own work, and
whether the path that grows it actually works.

## Required agent metadata

Each instantiated agent should expose:

- stable id and role name;
- parent and project id;
- assigned skill ids;
- repository, module, and work-item scope;
- responsibility and non-goals;
- private-memory boundary;
- reporting and escalation path;
- lifecycle state and availability;
- creation reason and provenance.

## Invariants

- No agent is created merely because a skill exists.
- No skill grants authority by itself.
- No role exists to perform non-software work; a request for that work is refused at intake, before
  staffing is considered.
- No private memory crosses project or agent boundaries without an explicit, auditable projection.
- Staffing follows discovered project aspects and approved scope.
- The roster remains durable across chat closure, process restart, and model changes.

## Implementation checklist

- [ ] Define one canonical `Agent` entity with role and relationship metadata.
- [ ] Give the seat its explicit attributes: role, project and module scope, skills, parent, and
  provenance — as fields on `Agent`, not as a parallel entity.
- [ ] Derive a seat's skills from its role and discovered aspects, and delete the three suffix
  heuristics (`PROJECT_TEAM_SKILL_MAP`, `PLATFORM_ROLE_SUFFIXES`, `FRONTEND_HINT_WORDS` /
  `BACKEND_HINT_WORDS`).
- [ ] Make a project lead able to create the seats it proposes, with the boundary decided in an ADR
  ([F-021](../eval/results/BOARD.md)).
- [ ] Report, rather than silently accept, a seat whose name matches no known role: today it is
  created with zero skills.
- [ ] Prove the seed set is not a taxonomy: staff a project whose aspects have no matching seed skill,
  and author the missing skill instead of degrading the plan.
- [ ] Define parent, child, lead, and specialist relationships without duplicate classes.
- [ ] Let the project lead propose staffing from project context.
- [ ] Support multiple instances of one skill with separate scope and memory.
- [ ] Enforce project, module, task, skill, and sandbox boundaries.
- [ ] Persist reporting lines, delegation, lifecycle, and availability.
- [ ] Prevent private memory from crossing agent or project boundaries.
- [ ] Show the roster consistently in chat, CLI, REST, and web.
- [ ] Create exactly the roster that was proposed, or state the difference and why.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] The seat's fields are explicit on `Agent`: role, project and module scope, skills, parent, provenance
- [ ] A seat's skills come from its role and discovered aspects, not from its name
- [ ] Staffing creates exactly what it proposed, or states the difference and why
- [ ] The roster is consistent on chat, CLI, REST, and web
## Gate

**Every instantiated agent has a scope, a parent, and an oracle, and the roster is exactly what was
proposed.** Staffing must create what it described; a role whose description claims six members while
the tree holds five is a durable false claim ([BOARD F-006](../eval/results/BOARD.md)).

Scored by [eval 03](../eval/03-stations-and-staffing.md) and the authority tests in
[eval 04](../eval/04-capability-boundary.md).

## Software scope and invariants

Staffing follows **aspects that exist on disk** — a schema, a pipeline, a platform, a compatibility
surface, an embedded target — and never a fixed team taxonomy. That is the staffing half of
project-type and architecture agnosticism ([invariants](../concepts/agnosticism-invariants.md)), and
it is also the scope boundary: a role is created because software in this repository needs that
responsibility, not because the skill catalog contains a matching name.

Two constraints carry over from [01](01-philosophy.md) and must not weaken as the roster grows:

- **No agent is created merely because a skill exists**, and no skill grants authority by itself.
- **Private memory does not cross a project or agent boundary** without an explicit, auditable
  projection. Repository isolation applies to memory as much as to files: one project's context must
  never become another project's starting point.
