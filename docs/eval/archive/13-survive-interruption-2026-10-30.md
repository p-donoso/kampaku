# 13 — Survive interruption

## Promise tested

Work survives process death or is reported lost honestly, and cancel really cancels.

## Why it elevates

Weak: ghost jobs that stay `running` forever after a kill; lost work that the board still shows as in
flight; a cancel that leaves the job running.

Credible: after a kill and restart the state is truthful (`expired`, lost, or resumable), no work is
double-executed on resume, and cancel stops progress and says so.

## Prereqs

- Suite [08](../08-hands-off-execution.md) green; a durable, multi-step execution is available.
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

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-10-23, two runs |
| Data dirs | `.kampaku/runs/s13r1/data` (before the fix), `.kampaku/runs/s13r2/data` (after it) |
| Git SHA | `33ef016` (r1) · `33ef016` + `8b2f317` (r2) |
| Model / provider | `deepseek-flash` via `http://127.0.0.1:3001/v1` |
| Wall clock | r1 ≈ 1 h 5 min, r2 ≈ 50 min |
| Tests | `eval-survive-interruption.test.ts` 8 green; `npm test` from the root green — core 173 files / 940 passed / 1 skipped, worker 26 / 132, web 34 / 82, exit 0 |
| Ports | 28000 core · 28001 web (the declared block's neighbours, free at start) |
| Fixture | `/home/pdonoso/projects/eval-seed-py` at `fdb6f9b`, manifest 25 files, unchanged across the interruption |

## Result

**10 / 10, binary pass, on run `s13r2`** — the fresh data dir taken after the fix. `s13r1` is the
measurement the fix came from and it does **not** pass: 3 of its 7 oracle bullets were false, all of them
in the same direction (the product reporting work it no longer had).

| Oracle bullet | `s13r1` (before) | `s13r2` (after) |
|---|---|---|
| A `running` job does not stay `running` after a kill | **failed** — `478faa26` read `running` after the relaunch, `finishedAt: null`, `error: null`, and `zombieJobs: 0` beside `runningJobs: 1` | **holds** — `b5acec90` read `expired` / `LEASE_ABANDONED` **5 s after the restart**, `zombieJobs: 1`, and Core printed the recovery line on boot |
| Lost work is reported as lost | **failed** — nothing said anything had been lost; the replacement job could not even be leased (1 m 43 s of a queue that never moved) | **holds** — the error names the item and says the work is lost rather than running; the queue moves in the same breath |
| Resume does not re-execute completed items; the count is monotonic | holds — the resume started the next leaf | holds — 3 succeeded jobs and 3 `done` items across pause → resume, nothing re-run |
| Cancel reaches a terminal non-success status and its artifacts stop changing | **failed** — the item read `cancelled` while its job kept running; the CLI had no cancel verb at all | **holds** — the in-flight job became `cancelled` / `WORK_ITEM_CANCELLED` with no files and no checks, from chat and from `kampaku jobs cancel` |
| Cancel is reachable from chat, CLI and web | **failed** (chat and CLI) | **holds** — chat → lead → item → job; `kampaku jobs cancel <id>`; the UI's job control posts the same route |
| A paused project does not start new items and says what it is still doing | holds | holds — `pause` during the audit; `execution` answered `autoExecute: false` and named the running task |
| The turn after a restart reconstructs state from durable records | **failed** — the reply could only say the job "still reads running" | **holds** — the post-restart turn answered what was in flight, what was lost, and what it could not read, from `get_job_ledger` and `get_project_journal` |
| Platform tree unchanged | holds (`0` lines in `git status --porcelain`) | holds (same) |

## Evidence

All under `.kampaku/runs/s13r1/logs/` and `.kampaku/runs/s13r2/logs/`.

| What | Where |
|---|---|
| The kill, and what the ledger said immediately after the relaunch, before the fix | `s13r1/logs/s13r1-beat5-kill.out`, `s13r1-jobs-before-kill.json`, `s13r1-exec-before-kill.json`, `s13r1-kill-at.txt`, `s13r1-restart-at.txt`, and `s13r1-beat5-after-restart.txt` (4.6 minutes on, still `running`, `zombieJobs: 0`, the replacement queued and unleasable) |
| The gate cards the worker's own recorded checks did not answer | `s13r1/logs/s13r1-operator-verification-leaf1.txt` … `-leaf3.txt`, `gates-answered.md`, `gate-*-answered.png` |
| The kill and the truthful state after the relaunch, with the fix | `s13r2/logs/s13r2-beat5-kill.out`, `s13r2-jobs-before-kill.json`, `s13r2-kill-at.txt`, `s13r2-restart-at.txt`, `s13r2/core.log` (`Recovered 1 job(s) abandoned …`) |
| Pause, resume and cancel, driven | `s13r2/logs/s13r2-beat3-pause.txt`, `s13r2-beat4-6.out` |
| The three surfaces agreeing on the same job states | `s13r2/logs/s13r2-u3-three-surfaces.txt` |
| The post-restart turn's answer | `s13r2/logs/p2-restart.out`, `p5-truth.out` |
| The oracle: fixture manifest before/after, its own checks, the platform tree | `s13r2/logs/s13r2-before-manifest.txt`, `s13r2-after-manifest.txt` (25 files, no path changed), `lint exit=0`, `0 line(s) in git status --porcelain` |

## Blocker

None open for this suite. Three rows were opened from `s13r1` and all three are **resolved** in `8b2f317`:
[F-126](../results/BOARD.md) (a killed job survives the restart and wedges the queue), [F-127](../results/BOARD.md)
(cancel does not reach the job, and the CLI cannot cancel at all), [F-128](../results/BOARD.md) (a verification
that passed was reported as failed).

Recorded, measured, and deliberately **not** rows of this suite:

- **Every leaf still costs the operator 4–5 gate cards.** `s13r1` raised 13 of them across four leaves and
  `s13r2` raised 25 across five, each asking *"Is it met?"* about a criterion the succeeded job had already
  answered with its own `check:test` / `check:lint` records, and each cleared by one
  `kampaku projects verify <item>`, which proved 2–3 of them and left the rest as genuine judgement. This is
  the limit [F-105](../results/BOARD.md) states rather than a new defect — the worker holds no general command
  runner, so a criterion is a human decision until the operator's own surface runs it — and it does not touch
  this suite's oracle: the interruption beats were driven with the gates answered, which is what a hands-off
  *execution* suite measures and this one does not.
- **Two jobs were accepted for one leaf at once** (`478faa26` still `running`, `b8c6e45e` queued for the same
  leaf by the re-dispatch). That is [F-093](../results/BOARD.md)'s family recorded where the kill made it
  visible, not a new row, and the boot recovery is what now prevents the stale one from blocking the fresh one.
- **`kampaku projects verify` skipped two of a criterion's quoted commands by name** (*"`PYTHONPATH=src` is not
  a program this surface runs"*, *"`` is not a program this surface runs"*) — an honest refusal about a
  pipeline it declined to parse, recorded in `s13r1/logs/…-leaf2.txt` beside the commands the operator then ran
  by hand. Not a row: it refuses rather than guesses, and F-122 owns that surface.
