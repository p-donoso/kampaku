# 13 — Survive interruption

## Promise tested

Work survives process death or is reported lost honestly, and cancel really cancels.

## Why it elevates

Weak: ghost jobs that stay `running` forever after a kill; lost work that the board still shows as in
flight; a cancel that leaves the job running.

Credible: after a kill and restart the state is truthful (`expired`, lost, or resumable), no work is
double-executed on resume, and cancel stops progress and says so.

## Prereqs

- Suite [08](08-hands-off-execution.md) green; a durable, multi-step execution is available.
- Public pause/resume/cancel primitives are exposed on CLI and REST.

## Beats

1. **Start durable work**: `Run the remaining planned items on this project.`
2. **Soft pause**: stop prompting for a period. State must not silently advance.
3. **Platform pause**: `kampaku projects pause <slug>`, then confirm no new work starts and the current
   one is described truthfully.
4. **Resume**: `kampaku projects play <slug>`, then confirm continuation without duplicates.
5. **Hard pause**: stop the stack, kill the worker mid-job, relaunch. Then: `What was in flight, and what was lost?`
6. **Cancel**: `Cancel the running work on this project.` then confirm progress stopped.
7. **Truth check**: `Show me the status of every item and job from before the interruption.`

## Oracle

- After a hard kill, jobs that were `running` do not remain `running` indefinitely: on restart they
  are marked expired/lost, or explicitly reported as unknown. A still-running green board after a kill
  fails this suite.
- Work that was lost is reported as lost. Work that was resumable resumes without duplicating artifacts
  or jobs.
- Resume does not re-execute completed items; the completed count is monotonic.
- Cancel stops the job: the job reaches a terminal non-success status and its artifacts stop changing.
- Cancel is reachable from chat, CLI, and web.
- A paused project does not start new items, and reports what it is still doing.
- The turn after a restart reconstructs state from durable records: the factory does not depend on the
  operator's earlier conversation to know what happened.
- Platform tree unchanged by this suite.

## How to measure

- Snapshot every job's status before the kill; compare after restart.
- Record wall-clock between kill and the first truthful status report.
- Compare artifact hashes before and after resume for completed items (must be unchanged).
- Confirm the cancel path from each surface.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — fresh data dir per run, ports from the declared block
- [x] U2 Public docs sufficient — every beat was driven from the CLI, REST and chat the docs name
- [x] U3 Job statuses agree on chat, CLI, and web across the restart — same ids, statuses and error codes on all three (`s13r2-u3-three-surfaces.txt`)
- [x] U4 Automated tests cited below are green — `eval-survive-interruption.test.ts` 8/8, core 173 files / 940 passed
- [x] U5 Fresh data-dir re-run after any fix — `s13r2`, after `8b2f317`
- [x] U6 No silent budget failure hiding the oracle — the longest turn was 4 m 50 s against a 15-minute budget, and no turn stopped on it
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite
- [x] F1 Work is software — a Python CLI in a real checkout
- [x] F2 No stack assumption in the oracle — `make check` / `make lint`, derived from the checkout
- [x] F3 Resume is scoped to the package that was in flight — resume started Phase B's first leaf, not Phase A's
- [x] F4 No existing artifact corrupted by a resume — the fixture manifest is byte-identical across the interruption and resume
- [x] F5 N/A

### Suite-specific

- [x] No orphan `running` jobs after a kill — `expired` / `LEASE_ABANDONED`, 5 s after the restart, on all three surfaces
- [x] Lost work reported as lost — the error names the item, and the next turn answered *what was in flight, and what was lost*
- [x] Resume produced no duplicates — 3 succeeded jobs, 3 `done` items, nothing re-run
- [x] Cancel truly stopped progress and is available on all surfaces — chat → lead → item → job, `kampaku jobs cancel`, the UI's job control
- [x] State reconstructable after a restart with no conversation history — answered from `get_job_ledger`, `get_project_journal`, `get_project`

### In-scope P-gates

- **P4** required

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-survive-interruption.test.ts` | Kill → truthful status; the queue is not wedged by a dead worker's lease; cancel cancels the job; resume does not re-execute done items; a stated-tab criterion is not reported as failed | **Authored 2026-10-23** (8 cases) · red without the fix, 7 of 7 before the modules existed and 3 of 7 with the modules present and only the wiring reverted · green on `8b2f317`, and the whole core suite with it (173 files, 940 passed, 1 skipped) |
| `apps/core/tests/planner/job-leasing.test.ts` · `apps/core/tests/eval/eval-stack-liveness.test.ts` | Lease expiry and worker liveness, unchanged by this suite | Re-run green |

The suite's first `Automated tests` row named a `recoverJobsAfterRestart` that **did not exist anywhere in the tree** — a lock cited as "exist" that was never written. That is what the first run measured as a defect rather than as a missing test.

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.

## Evaluation status

The recorded verdict and checklist above remain the suite status. Detailed manual run logs, prior results, evidence, and historical blocker notes are in the [historical suite record](archive/13-survive-interruption-2026-10-30.md).

For current open product gaps, consult the [evaluation board](results/BOARD.md).
