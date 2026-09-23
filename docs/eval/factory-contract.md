# Factory contract

The current authority and behavior contract for the root agent and the line. This replaces the
advisory-only orchestration contract that was in force from 2026-09-15.

## Promise tested

Kampaku is a software factory. Its front desk opens work orders, its line produces software under
bounded authority, and its inspection re-executes the checks that justify every completion claim.

## Authority model

Three roles with different powers, and the boundary between them is what makes the factory honest:

| Role | May | May not |
|------|-----|---------|
| **Front office** (root agent `kampaku`) | Read project and agent state, assess change requests, inspect journals and capacity, open a project container with a linked repository and lead, create and manage sub-agents, delegate an end-to-end session, ask the emperor structured questions | Submit a plan, mutate a work item, approve a plan, write to a repository, reach a shell, close work, or read private specialist memory |
| **Line** (project leads, specialists, workers) | Plan inside their project, decompose into work items, execute leased jobs in a sandbox, produce artifacts, report evidence, escalate questions and blockers | Act outside their project, parent work item, or skill scope |
| **Inspection** (quality gates, evidence validation, claim audit, objective coverage) | Reject a completion whose checks or evidence are missing, unverified, failed, or unreferenced; reopen on sabotage; report unverified claims | Mutate the artifact it is inspecting |

Runtime authorization is enforced in code from the actor, project, parent work item, and skill scope.
Prompt text is never a grant.

> **Implementation status.** The front-office row above is the decided contract
> ([ADR-0005](../adr/0005-factory-authority-model.md)) and is **not yet implemented**: the root
> agent's allowlist currently excludes `create_project`, so the agent path cannot open a work order.
> Tracked as [BOARD F-001](results/BOARD.md). The line and inspection rows describe current behavior.

## Oracle

The contract holds only when all of the following are true:

**Front office**

- There is exactly one deterministic, immutable built-in root agent.
- The advertised tool list matches the front-office allowlist: read and assessment tools, plus the
  front-office mutations (open a project container, create and manage sub-agents, delegate) — and
  nothing that belongs to the line.
- Every advertised tool resolves in the runtime registry.
- A fresh instance and ordinary chat invent no projects, teams, roles, or work items.
- A concrete build request without explicit staffing authorization stays side-effect free and names
  the responsible lead.
- A project container can be created from chat, CLI, and REST, and all three agree on the slug and id.
- Structured questions are machine-readable, focused, and durably answerable from the UI and CLI.

**Line**

- Project governance, work-item mutation, plan submission and approval, repository writes, and
  execution stay with the responsible domain owner and the worker.
- A work item cannot be closed without evidence that references its acceptance criteria.
- Critical objective requirements cannot be silently omitted; deferred or rejected scope carries a
  recorded reason.
- No work executes before an approved plan.

**Inspection**

- A completion whose required checks are missing, unverified, failed, or unreferenced is rejected.
- A reply that claims durable changes its own turn did not make is reported as containing unverified
  claims.
- A blocked blocker cannot be requeued while another active job exists, and an unavailable recipient
  cannot silently resolve it or restart work.
- Verification and evidence use capability and subject types independent of language, toolchain, and
  model provider.

**Scope and invariants**

- Non-technical deliverables (creative writing, research, non-technical documents, standalone design)
  are refused with the boundary named.
- Acceptance evidence derives from the project's own toolchain.
- Existing repository conventions win over factory defaults.

## Automated tests

| Test | Locks |
|------|-------|
| `apps/core/tests/eval/eval-orchestrator-contract.test.ts` | Front-office allowlist in both directions: front-office mutations present, line capabilities absent; deterministic identity; delegation; persistence; the human-question contract. **Must be rewritten per [ADR-0005](../adr/0005-factory-authority-model.md); it currently asserts the contradiction.** |
| `apps/core/tests/eval/eval-execution-assurance.test.ts` | Generic quality gates, objective coverage, scope changes, blocker recovery, verification adapters, evidence-kind validation |
| `apps/core/tests/eval/eval-software-scope.test.ts` | The front office names software as the deliverable, names the refused categories, keeps the three agnosticism invariants, and promises no arbitrary non-software work; the intake tool and skill carry the same boundary |
| `apps/core/tests/eval/eval-docs-coherence.test.ts` | Product, vision, branding, concept, architecture, security, eval, and roadmap documents describe one software factory, link the statute and the invariants, keep completion evidence-bound, and leave no broken link or live catch-all promise |
| `apps/core/tests/pm/blocker-triage.test.ts` | Durable blocker triage never substitutes an unavailable recipient for a real resolution |
| `apps/core/tests/agents/claim-audit.test.ts`, `apps/core/tests/agents/claim-audit-e2e.test.ts` | A reply is reconciled against durable state; a no-op turn cannot claim creation |
| `apps/core/tests/agents/create-project.test.ts` | Container creation validation, workspace refusal, and corrective refusals naming `create_project` |
| `apps/web/e2e/eval-orchestrator-contract.spec.ts` | Browser-visible routing plus before/after project and agent parity |
| `apps/web/tests/components/sub-nav.test.tsx` | Serializable nested navigation selection required by the production build |

Suite-level locks are listed in each suite file. A contract change that alters an oracle requires
re-scoring every suite that cites the affected test. These locks run in the default test command
(`npm test`, and `npm run test:eval` on its own), so a regressed promise fails the build instead of
staying a manual claim.

## Evidence

Recorded evidence lives in each suite's **Run log** and in [results/BOARD.md](results/BOARD.md).
Re-run the cited tests on a fresh data dir before claiming the contract green.
