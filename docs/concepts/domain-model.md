# Domain model

Canonical vocabulary used across Core, Worker, Web, contracts, and the evaluation lab.

Every entity below belongs to the [software factory](../product/software-factory.md): the durable
objects exist to plan, build, verify, and ship software. The model does not describe non-software
deliverables, and no term in it should be widened to carry one.

The factory view of this model — work order, line, station, gate, inspection, shipment — is described
in the [product statute](../product/software-factory.md) § Vocabulary. It describes the same objects
from a production point of view. This file remains the canonical noun list for code, contracts, and
API shapes.

| Term | Meaning |
|------|---------|
| **Project** | Governed unit of work with metadata and references to one or more external repositories. The container a work order lives in |
| **Work item** | Dependency-aware unit of planned work (recursive tree; replaces legacy flat task/sprint splits) |
| **Parent work item** | Immediate superior work item that owns decomposition and acceptance |
| **Job** | Schedulable execution attempt for a work item, leased to a worker |
| **Agent** | Persistent role with policy, capabilities, instructions, and memory references. An instantiated agent is a **seat**: a role bound to a project and module scope, holding a skill set, reporting to a parent. The seat is the set of fields on this entity, not a separate class ([roster](../roadmap/08-project-agent-roster.md) § The seat) |
| **Sub-agent** | Child agent in the hierarchy under a superior |
| **Specialist** | Agent assigned to a project lead for decomposition inside that project, covering one aspect of the work |
| **Project lead** | Agent accountable for project coherence |
| **Superior** | Direct parent agent for escalation (questions and blockers) |
| **Worker** | Execution host advertising capabilities and accepting leased jobs |
| **Skill** | Modular capability assignable to agents (tools + Markdown instructions) |
| **Tool** | Bounded operation available under an explicit capability and policy |
| **Question** | Escalation asking for a decision or missing information |
| **Blocker** | Escalation for an unsolvable problem until cleared |
| **Wiki** | Verified shared project knowledge |
| **Journal** | Operational handoff and escalation record for superiors |
| **Memory** | Private reusable agent context (logs and learnings) |
| **Acceptance criterion** | A stated, checkable condition a work item must satisfy, with a stable id |
| **Evidence** | A recorded observation that a criterion holds: subject type, format, verification method, producer, and time |
| **Completion report** | Evidence-backed claim that work is done |
| **Shipment** | A versioned artifact plus the knowledge that describes it |

## Notes that matter for correctness

- **The project is the boundary, not the repository.** A project may reference several repositories
  with roles; work items state which repositories they touch
  ([invariants §3](../concepts/agnosticism-invariants.md)).
- **A specialist covers an aspect, not a job title.** Roles follow what exists on disk: a schema, a
  pipeline, a platform, a compatibility surface. There is no fixed roster.
- **The shipped catalog and roster are a seed, not a taxonomy.** The skills and platform stations that
  ship with the platform are a starting set of suggestions. A project is staffed from its own evidence,
  and when nothing in the catalog fits, the factory authors the skill or seat it needs
  ([18](../roadmap/18-self-extension.md)).
- **A skill is reused; a seat is not interchangeable.** The catalog is shared capability with no
  project memory. Two seats using the same skill keep separate scope, decisions, and memory.
- **Evidence is about a criterion, never a free-text claim.** Evidence that references no criterion is
  rejected at closure.
- **Three records stay distinct.** Private agent memory (reusable personal context), superior journal
  (operational handoff and escalation), and wiki (verified shared knowledge) are not interchangeable.
- **A claim is not a record.** A stored path, a stored branch name, or a reply sentence is verified
  against disk or it is unverified.

Legacy terms still seen in older ADRs — **Goal**, **Plan**, **Task**, **Run** — map onto projects,
work items, and jobs in the current control plane.
