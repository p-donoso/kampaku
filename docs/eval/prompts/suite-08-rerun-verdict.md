# Kickoff — suite 08 re-run, for the verdict

Kampaku eval lab. Suite **08 — hands-off execution**, re-run end to end on a **fresh data dir** to move it off the
measured 8/10. You do the work; I do not.

Read first, in this order:

1. `docs/eval/NEXT-SESSION.md` — how this lab's work is done: CLI is the canonical record, a row is closed by live
   measurement and never by argument, one reviewable commit per piece on `develop`, fix a blocker in the moment.
2. `docs/eval/00-protocol.md` — the run protocol, and what a fresh data dir means.
3. `docs/eval/08-hands-off-execution.md` — the suite: promise, the three emperor prompts, oracle, 10/10 checklist,
   § *What run `s08r7` still does not do*, § Blocker.
4. `docs/eval/results/BOARD.md` — the rows. Read the ones this suite opened: F-073…F-085.
5. `docs/eval/07-plan-a-human-can-run.md` — the shape of a run log that closed at 10/10, and its § Blocker.

## Where the work stands

- **Run `s08r7` is the 8/10 measurement.** Three consecutive leaves closed from their own first jobs, each after the
  operator answered its criteria gate through the web UI. Its remaining misses are enumerated in the suite doc. Do
  **not** reuse `.kampaku/runs/s08r7/` — that data dir is the previous measurement and the specimen F-084 was closed
  against.
- **Since `s08r7`, one of its two withheld points is closed:** `0f168a0 feat(core): a risk the gate stops on is a risk
  the operator can read and discharge` (F-084 `resolved`). An open high risk still stops `play` — that is the
  behaviour, not the defect — and the operator can now read the blocking risk with `kampaku risks list | show` or
  `GET /api/v1/risks`, and discharge it with `kampaku risks mitigate | accept | escalate`. Exercise that path if this
  run's `play` gates on `open_high_risk`: it is what the row was closed on, and a re-run that never reaches it leaves
  the fix unmeasured.
- **F-085 is `open` and recorded as non-blocking:** a reply denied a check that ran (`"It produced no check output"`,
  while the job's record held `checkResults: {"test": true}` and the runner's transcript). The mitigation is half
  built — `0f830ee` puts each landed item's checks in the block every turn carries. Re-measure it: if it stands
  between this run and its verdict, the standing rule applies and you fix it in the moment, record it, and re-measure.

## The run

- New data dir: `./scripts/runs.sh new s08r8`, bootstrap, start the stack, drive it by CLI.
- The same three emperor prompts, in order, from the suite doc, plus the prereqs it names. Same fixture, same project.
- Human gates through the web UI, as the protocol requires.
- Measure every box of the 10/10 checklist on the live instance, and state plainly which boxes the run holds and which
  it does not — U8 in particular: *no open blocking BOARD row for this suite*.

## Delivery

A run log in `docs/eval/08-hands-off-execution.md` in the shape suite 07's closed in: prereqs, fixture, each prompt
with its tool calls, oracle state before and after, result, evidence, honest gaps, and the **verdict**. Patch
`docs/eval/results/BOARD.md` and `docs/eval/results/LEARNINGS.md` with what was actually measured. One reviewable
commit on `develop`, conventional commit with a scope. Evidence files stay in `.kampaku/runs/s08r8/logs/`.

Report at the end: the verdict and its number, the boxes not held with the measurement that says so, and any row this
run opens.
