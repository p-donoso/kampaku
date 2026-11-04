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

- [x] U1 Empty instance
- [x] U2 Public docs sufficient
- [x] U3 UI and CLI agree on ids and fields
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix
- [x] U6 No silent budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite
- [x] F1 Journeys concern software work
- [x] F2 The UI shows the project's real toolchain, not an assumed one
- [x] F3 The UI shows the repository set the project actually has
- [x] F4 N/A
- [x] F5 A done item's evidence is readable in the UI

### Suite-specific

- [x] All seven journeys completed without the terminal
- [x] Every UI action produced a durable change
- [x] Pending panel shows only pending items
- [x] Evidence visible for a done item
- [x] No stale running state after restart
- [x] Errors show the server's explanation

### In-scope P-gates

- **P3** required · **P4** required for journey 6 · **P7** required for journey 5

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/web/e2e/eval-operator-journeys.spec.ts` | The seven journeys against a stub Core on dedicated ports | **Authored 2026-11-04**; 7/7 green |
| `apps/core/tests/eval/eval-operator-ui.test.ts` | The reads the journeys stand on: the item's evidence keyed by criterion, the keying-before-validation order in the closure gate, and the planner's own sentence instead of a bare 500 | **Authored 2026-11-04**; 6/6 green, 3 of them verified red without the fix |
| `apps/web/tests/components/work-item-evidence-panel.test.tsx` | Journey 7's panel: criterion id, the record's check, `recorded` vs `matched`, and a criterion with no evidence said out loud | 5 green |
| `apps/web/tests/components/open-work-order-form.test.tsx` | Journey 5's form: the owner is required, and the record rendered is the store's | 3 green |
| `apps/web/tests/components/project-wiki-panel.test.tsx` | Journey 4: approve/reject as the project's **linked lead**, with the reason stated when there is none | 4 green (1 pre-existing, 3 added) |
| `apps/web/e2e/eval-orchestrator-contract.spec.ts` | Browser-visible routing and parity | Re-run green in the same suite run |
| Web component tests for detail-panel save semantics | Save reads current handlers, not a stale closure | Re-run green |

## Pass

- Binary: all journeys hold.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-11-04 |
| Data dir | `/tmp/kampaku-e2e-*` (Playwright fixture) and `/tmp/s16-restart2/data` (the killed-stack run) |
| Git SHA | `24a01ce` + this change |
| Model / provider | `stub` on **both** planes (`KAMPAKU_AGENT` and `KAMPAKU_PLANNER`) — see *What the run measured* |
| Ports | `28081` / `28003` (the declared Playwright block); `28098` for the killed-stack run |
| Tests | core 176 files / 957 passed 1 skipped · core eval lock 6/6 · web 36 files / 93 passed · worker 27 files / 135 passed · Playwright 50 passed 1 skipped, including this suite's 7 |

## What the run measured

**Seven journeys, seven green.** The browser lock drives each one: the roster and item status read back against the
same route the CLI reads (1); a pending question carrying its **text, its id and an answer control**, answered in
the card and then read from the store (2); a job's own log lines rendered in the panel and **cancelled from it**,
with the store answering `cancelled` (3); a proposal approved from the page as the project's linked lead, with the
page leaving the pending list and reading `published` (4); a container opened **in the UI** and then read from REST
and from a spawned `kampaku projects list` (5); a job settled by the product's own worker-recovery route and the
panel showing `expired`, never `running` (6); a done item whose panel names the criterion, the check that produced
the evidence and the attribution (7).

**Journey 6 was also measured on a stack that was actually killed**, because the browser cannot kill a server and
the oracle's sentence is about a restart: `kill -9` on the process holding the port, then the same data dir and the
same port restarted. Afterwards: `runtime/status` `runningJobs: 0, zombieJobs: 1`, the job `expired` with
`LEASE_ABANDONED`, the item `blocked/failed`, the CLI's `jobs list` and `projects show` agreeing, and Core's own
boot line — *"Recovered 1 job(s) abandoned by a previous process … reported lost (expired), not as running."*

**What this run found, and what it cost.** The suite could not be driven at all when it was opened, and the
failures were not in the fixtures:

- **Journeys 4, 5 and 7 had no surface.** A pending proposal rendered as read-only text with no control; the projects
  page rendered a roster and nothing that could open a container (the only intake form in the app submitted an
  *intent* to the planner, which is a different object); and no page anywhere carried a work item's evidence — the
  panel listed the acceptance criteria as prose and the Job tab showed raw JSON. [F-133](results/BOARD.md).
- **The evidence gate refused the evidence a good job produces.** `shouldBlockDishonestSuccess` validated each
  declaration **before** keying it to the item's criteria and required `criterionId` on it, so a job that ran the
  check its own criterion names was left `blocked` with *"Structured evidence failed: invalid evidence record."*
  That is why journey 7's item could not be made `done` at all. [F-135](results/BOARD.md).
- **A misconfigured instance answered a bare 500.** `POST /work-items/:id/execute` on a Core whose
  `KAMPAKU_PLANNER` was `llm` with no key answered `500 Internal Server Error` with no body, while the product held
  the sentence explaining it. [F-134](results/BOARD.md).

The fixture's own half is recorded because a reader comparing runs would otherwise think the product had changed:
`playwright.config.ts` set `KAMPAKU_AGENT=stub` and left `KAMPAKU_PLANNER` on its `llm` default, so every execution
journey hit the key error above. Both planes are stubbed now, which is what `kampaku dev` does when it selects stub
mode, and it is stated here rather than papered over.

## Result

**10 / 10.** Every journey works by clicking, every UI action produced the durable change the suite requires, and
the four fixes it forced are locked by tests cited above (three of them verified red with the fix reverted).

## Evidence

- `apps/web/e2e/eval-operator-journeys.spec.ts` — the seven journeys, 7/7 green in 36.6 s.
- `apps/core/tests/eval/eval-operator-ui.test.ts` — 6/6; the evidence read, the keying order, the planner's
  sentence. Red-without-the-fix: 3 of 6 with the read reverted, 2 of 6 with the keying reverted, 1 of 6 with the
  planner mapping reverted.
- `apps/web/tests/components/{work-item-evidence-panel,open-work-order-form,project-wiki-panel}.test.tsx` — the
  panel, the intake form and the decide control.
- Regression, same commit: core **176 files / 957 passed, 1 skipped**, web **36 files / 93 passed**, worker
  **27 files / 135 passed**, Playwright **50 passed, 1 skipped** across every other suite's browser lock.
- Killed-stack run: `/tmp/s16-restart2` (script `/tmp/s16-restart2.sh`), quoted above.

## Blocker

None open. [BOARD F-001](results/BOARD.md) (journey 5's blocker) and [F-092](results/BOARD.md) (the browser's
Core address baked at build time) are resolved, and the three rows this run opened are resolved in the same
commit.

**One judgement, recorded rather than argued:** [F-076](results/BOARD.md) is `open` and its `suites` cell names
16. It is not a blocker here and this suite does not gate on it, for the reason that row's own note gives: a
question is answerable **from the UI and the CLI**, which is exactly what journey 2 requires and what this run
measured end to end — what F-076 records is that the *front office* cannot close a gate itself, which is a
different promise and is refused honestly in prose. [F-010](results/BOARD.md), [F-013](results/BOARD.md) and
[F-016](results/BOARD.md) name 16 in the non-blocking table; none of them touches a journey.
