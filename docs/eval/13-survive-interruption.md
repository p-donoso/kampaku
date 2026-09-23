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

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Job statuses agree on chat, CLI, and web across the restart
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Work is software
- [ ] F2 No stack assumption in the oracle
- [ ] F3 Resume is scoped to the package that was in flight
- [ ] F4 No existing artifact corrupted by a resume
- [ ] F5 N/A

### Suite-specific

- [ ] No orphan `running` jobs after a kill
- [ ] Lost work reported as lost
- [ ] Resume produced no duplicates
- [ ] Cancel truly stopped progress and is available on all surfaces
- [ ] State reconstructable after a restart with no conversation history

### In-scope P-gates

- **P4** required

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| Job recovery tests (`recoverJobsAfterRestart` and friends) | Orphan running jobs are marked expired on serve | Exist; re-run and cite |
| `apps/core/tests/eval/eval-survive-interruption.test.ts` | Kill → truthful status; resume without duplicates; cancel is terminal | **To author** |

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Model / provider | — |
| Wall clock | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

None beyond prior suites.
