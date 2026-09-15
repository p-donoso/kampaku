# Current advisor contract

## Promise tested

Kampaku is the emperor's read-only advisor. It may clarify intent, inspect public project and agent state, assess changes, and route decisions. Project, work-item, agent, execution, repository, private-memory, and shared-publication mutations belong to the responsible domain owners.

## Oracle

The current evaluation passes only when all of the following remain true:

- Kampaku is a deterministic immutable built-in agent.
- Its advertised tools exactly match the read and assessment allowlist.
- Fresh startup and advisory chat do not invent projects, teams, roles, or work items.
- Concrete build, delegation, bootstrap, execution, retry, completion, and publication requests remain side-effect free.
- Repository, shell, filesystem, private-memory, approval, and durable job-control tools are absent from the advisor allowlist.
- Structured questions remain machine-readable and focused.
- Every advertised advisor tool resolves in the runtime registry.
- Conversations are persisted and inspectable in the operator UI.
- Domain routing remains generic rather than assuming a software-engineering roster.

## Automated tests

- `apps/core/tests/eval/eval-advisor-contract.test.ts`: cases 01–19, including exact capability and persistence checks.
- `apps/core/tests/eval/eval-execution-assurance.test.ts`: generic quality gates, objective coverage, scope changes, blocker recovery, verification adapters, and evidence-kind validation.
- `apps/core/tests/pm/blocker-triage.test.ts`: durable blocker triage never substitutes an unavailable recipient for a real resolution.
- `apps/web/e2e/eval-advisor-contract.spec.ts`: browser-visible routing plus before/after project and agent parity.
- `apps/web/tests/components/sub-nav.test.tsx`: serializable nested navigation selection required by the production build.

## Evidence

Fresh verification on 2026-09-11:

- Contracts: 26 contract files and 34 Agent Skills validated.
- Unit/integration: worker 25, web 77, core 232 tests passed.
- Browser: 26 Playwright tests passed, including the advisor no-mutation check.
- Build: worker, web, and core production builds passed.
- Lint and TypeScript checks passed.

## Historical suites

The numbered 01–19 documents remain available as historical lab records. Their old direct-mutation workflows are superseded by this contract and must not be used as current acceptance criteria.
