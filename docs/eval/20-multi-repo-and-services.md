# 20 — Multi-repository and multi-service

## Promise tested

A project can own more than one repository and more than one deployable, and a cross-repository change
is approved as one unit, applied consistently, or reported as partially applied.

This suite is the executable form of invariant §3 for the multi-repo case
([agnosticism invariants](../concepts/agnosticism-invariants.md)).

## Why it elevates

Weak: a project links exactly one repository, so a service and its client cannot be expressed; a change
lands in repository A while its contract counterpart in B is left stale and reported as complete; a
scoped change rebuilds the whole workspace; a breaking shared-contract change carries no versioning
decision.

Credible: the topology is discovered, the blast radius is stated before approval, and the change either
lands on both sides or the partial state is reported explicitly.

## Prereqs

- Suites [11](11-honest-done.md) and [19](19-brownfield-and-legacy.md) green.
- **Two** scenarios prepared outside the platform:
  - **S** — two repositories that must change together: a service that exposes a contract and a client
    that consumes it.
  - **W** — a monorepo with many packages where the operator requests a change in exactly one, to test
    scoped operation at scale.

## Emperor prompts

1. **Link the pair**: `Open a work order for two repositories that belong together: the service at <S1> and the client at <S2>. They are one system.`
2. **Cross-repo change**: `Add a field to the service's response contract and update the client to consume it. Show me everything that changes before you apply it.`
3. **Approval scope**: `I approve. Tell me again which repositories this touches.`
4. **Partial-application probe**: while the change is applied, interrupt it (kill the worker between
   the two repositories), restart, and ask: `Is this change complete? Which repository is stale?`
5. **Scoped change at scale (W)**: `Change one behavior in the <package-name> package of <W>. Do not rebuild or re-verify the other packages.`

## Oracle

- **Topology discovered.** The factory reports the repositories that must change together, and the
  contract that joins them (schema, OpenAPI document, shared package, message shape).
- **One approval names every repository.** The approval request lists both `<S1>` and `<S2>`; approving
  a change to one does not silently authorize the other.
- **Consistency or an honest partial report.** After prompt 4, the factory either reports the change as
  incomplete with the stale repository named, or completes it after the restart. A claim of completeness
  with one side stale fails this suite.
- **Versioning decision recorded.** A breaking contract change carries a recorded decision
  (compatible addition, version bump, or coordinated migration). A breaking change with no recorded
  decision is refused.
- **Scoped operation (W).** The change touches one package; the other packages' artifacts are not
  rebuilt or re-verified. If the product cannot address a single package, that is a finding.
- **Both repositories remain coherent with the project record**: the project's repository list contains
  both, with roles, and is visible on all three surfaces.
- Neither repository is left in a broken state without being reported.
- Platform checkout unchanged.

## How to measure

- Project repository list before/after, with roles, on chat/CLI/web.
- `git -C <S1> diff`, `git -C <S2> diff` after the change and after the interrupt.
- For W: record which packages were rebuilt (artifact timestamps or build logs).
- Read the approval record and confirm both repositories are named.
- Confirm the contract's consumers in the scenario existing tests reflect the new field.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Repository list and roles agree on chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Both repositories contain software
- [ ] F2 Checks use each repository's own toolchain
- [ ] **F3 Satisfied by construction — this suite is F3's multi-repo oracle**
- [ ] F4 Existing client and service code respected, not rewritten
- [ ] F5 Both sides are runnable/testable via their own commands

### Suite-specific

- [ ] Topology and joining contract reported
- [ ] One approval naming every affected repository
- [ ] Partial application reported honestly, or completed after restart
- [ ] Versioning decision recorded for a contract change
- [ ] Scoped change did not rebuild unrelated packages
- [ ] Both repositories coherent with the project record

### In-scope P-gates

- **P1** required · **P2** required · **P4** required for prompt 4 · **P7** required · **P8** required

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-multi-repo.test.ts` | Multi-repository project; approval naming all repositories; partial application reported; scoped package change | **To author** |
| `apps/core/tests/application/repository-policy.test.ts` | Multiple repository links validated consistently | Exists; extend for the multi-repo case |

## Pass

- Binary: all oracle bullets hold for both scenarios.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Scenario S1 / S2 / W paths | — |
| Model / provider | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

No [BOARD F-001](results/BOARD.md) blocker remains (resolved 2026-09-23). If a project cannot link
more than one repository, that is a
roadmap-blocking finding for the multi-repository phase
([project context roadmap](../roadmap/06-project-context.md)).
