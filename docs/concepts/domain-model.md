# Domain model

Canonical vocabulary used across Core, Worker, Web, contracts, and evaluation:

| Term | Meaning |
|------|---------|
| **Project** | Governed unit of work with metadata and references to one or more external repositories |
| **Work item** | Dependency-aware unit of planned work (recursive tree; replaces legacy flat task/sprint splits) |
| **Parent work item** | Immediate superior work item that owns decomposition and acceptance |
| **Job** | Schedulable execution attempt for a work item, leased to a worker |
| **Agent** | Persistent role with policy, capabilities, instructions, and memory references |
| **Sub-agent** | Child agent in the hierarchy under a superior |
| **Specialist** | Domain agent assigned to a project lead for decomposition inside that project |
| **Project lead** | Agent accountable for project coherence (typically `*-lead` / `*-manager`) |
| **Superior** | Direct parent agent for escalation (questions and blockers) |
| **Worker** | Execution host advertising capabilities and accepting leased jobs |
| **Skill** | Modular capability assignable to agents (tools + prompt fragments) |
| **Tool** | Bounded operation available under an explicit capability and policy |
| **Question** | Escalation asking for a decision or missing information |
| **Blocker** | Escalation for an unsolvable problem until cleared |
| **Wiki** | Verified shared project knowledge |
| **Journal** | Operational handoff and escalation record for superiors |
| **Memory** | Private reusable agent context (logs and learnings) |
| **Completion report** | Evidence-backed claim that work is done |

Legacy terms still seen in older ADRs (**Goal**, **Plan**, **Task**, **Run**) map onto work items and jobs in the current control plane.
