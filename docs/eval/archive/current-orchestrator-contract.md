# Current orchestration contract

## Promise tested

Kampaku is the emperor's orchestrator. It clarifies intent, inspects public project and agent state, assesses change requests, appoints a responsible project lead, and delegates end-to-end work to that lead. Project governance, work-item mutation, plan approval, repository linking, and execution stay with the responsible domain owner.

## Oracle

The current evaluation passes only when all of the following remain true:

- Kampaku is a deterministic immutable built-in agent.
- Its advertised tools exactly match the orchestration allowlist: read/assessment tools plus `create_sub_agent` and `delegate_to_agent`.
- Fresh startup and ordinary chat do not invent projects, teams, roles, or work items.
- A concrete build request without explicit staffing authorization stays side-effect free and names the responsible project lead.
- Explicit emperor authorization allows exactly one scoped staffing mutation and one delegated session, nothing broader.
- Plan submission, work-item mutation, repository writes, shell access, private memory, plan approval, and durable job control remain absent from the Kampaku allowlist.
- Every advertised Kampaku tool resolves in the runtime registry.
- Structured questions remain machine-readable and focused.
- Conversations are persisted and inspectable in the operator UI.
- Domain routing remains generic rather than assuming a software-engineering roster.

## Automated tests

- `apps/core/tests/eval/eval-orchestrator-contract.test.ts`: exact capability boundary, staffing authorization, delegation, persistence, generic routing, and the human question contract.
- `apps/core/tests/eval/eval-execution-assurance.test.ts`: generic quality gates, objective coverage, scope changes, blocker recovery, verification adapters, and evidence-kind validation.
- `apps/core/tests/pm/blocker-triage.test.ts`: durable blocker triage never substitutes an unavailable recipient for a real resolution.
- `apps/web/e2e/eval-orchestrator-contract.spec.ts`: browser-visible routing plus before/after project and agent parity.
- `apps/web/tests/components/sub-nav.test.tsx`: serializable nested navigation selection required by the production build.

## Evidence

Recorded evidence lives in each suite's **Run log** and in [results/BOARD.md](results/BOARD.md). Re-run the cited tests on a fresh data dir before claiming green.

## Historical suites

The numbered 01–19 documents remain available as historical lab records. Their old direct-mutation workflows are superseded by this contract and must not be used as current acceptance criteria.
