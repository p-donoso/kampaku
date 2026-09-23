# 16 — Operator UI

## Promise tested

The critical operator journeys work by clicking: read the board, answer a gate, follow a job, read and
approve knowledge, and see the same truth the CLI sees.

## Why it elevates

Weak: the UI is a brochure over the CLI; a gate can only be answered in the terminal; a panel saves
without changing the API; a page renders a count where a verifiable path is needed.

Credible: an operator can supervise and decide without the terminal, and every UI action is backed by
the same API the CLI uses.

## Prereqs

- Suites [02](02-three-surfaces.md), [10](10-human-in-the-loop.md), [13](13-survive-interruption.md)
  green, so there is a gate to answer, a job to follow, and a status to read.
- Web UI up per [00-protocol.md](00-protocol.md); only one Next.js process per `apps/web`.

## Journeys (each one clicked, not screenshotted)

1. **Board**: open the project, see its work items with statuses matching the CLI.
2. **Gate**: find a pending question and answer it from the UI; confirm the linked work unblocks.
3. **Execution**: open a job and see real progress or logs; cancel it from the UI.
4. **Knowledge**: find a pending proposal, and approve or reject it from the UI as the authorized role.
5. **Intake**: open a work order from the UI (create a container) and confirm chat and CLI see it.
6. **Recovery**: after a restart, reload the UI and confirm the board reflects truthful post-restart
   state.
7. **Evidence**: open a done item and see the evidence that justifies it, including which check
   produced it.

## Oracle

- Every journey works without the terminal.
- The ids and statuses shown match the CLI and the API at the same moment.
- A UI action produces the same durable change as the equivalent CLI action; a UI "save" that changes
  nothing is a failure.
- The pending-question panel shows the question text, its id, and an answer control, and shows only
  questions that are actually pending.
- A done item exposes its evidence, and at least one evidence record names the criterion it covers.
- The UI does not present a claim as verified when the state says otherwise; unverified claims are
  visible where the reply is shown.
- After a restart, no stale `running` state is displayed.
- Error states show the server's own explanation, not a bare status code.

## How to measure

- For each journey, capture the UI state and the CLI state at the same moment.
- For each UI action, confirm the durable change through the CLI or REST.
- Reload after a restart and compare against the pre-kill snapshot.
- Attempt a journey while `kampaku dev` web is running vs stopped, and record the operator friction as
  an ops finding if the lab setup requires stopping the product's own UI.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 UI and CLI agree on ids and fields
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Journeys concern software work
- [ ] F2 The UI shows the project's real toolchain, not an assumed one
- [ ] F3 The UI shows the repository set the project actually has
- [ ] F4 N/A
- [ ] F5 A done item's evidence is readable in the UI

### Suite-specific

- [ ] All seven journeys completed without the terminal
- [ ] Every UI action produced a durable change
- [ ] Pending panel shows only pending items
- [ ] Evidence visible for a done item
- [ ] No stale running state after restart
- [ ] Errors show the server's explanation

### In-scope P-gates

- **P3** required · **P4** required for journey 6 · **P7** required for journey 5

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/web/e2e/eval-operator-journeys.spec.ts` | The seven journeys against a stub Core on dedicated ports | **To author** (extend the existing orchestrator-contract spec) |
| `apps/web/e2e/eval-orchestrator-contract.spec.ts` | Browser-visible routing and parity | Exists; re-run and cite |
| Web component tests for detail-panel save semantics | Save reads current handlers, not a stale closure | Exist; re-run and cite |

## Pass

- Binary: all journeys hold.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Model / provider | — |
| Ports | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

[BOARD F-001](results/BOARD.md) is resolved (2026-09-23), so journey 5 is no longer blocked by it.
