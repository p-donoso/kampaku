# 08 — Hands-off execution

## Promise tested

After go-ahead, work runs with visible jobs and progress, and real artifacts land in the project's
repository — and nowhere else.

## Why it elevates

Weak: silent failure, fake success, progress that cannot be observed while it runs, or writes that
reach the platform or an unrelated directory.

Credible: an operator can watch progress, the artifacts exist on disk where the plan said, and the
platform tree is untouched.

## Prereqs

- Suites [06](06-greenfield-stranger-repo.md)–[07](07-plan-a-human-can-run.md) green; the emperor has
  approved a plan.
- A configured model endpoint for the real path ([17](17-provider-fidelity.md)).

## Emperor prompts

1. `Execute the approved plan on the project only. Show progress. Stop and ask if you hit a wall.`
2. While it runs: `What is happening right now, and which job is doing it?`
3. After it finishes: `Which files did you create or change, and which check proves each one?`

## Oracle

- Jobs or equivalent execution records appear and update while the work runs, visible from the CLI and
  the UI without polling a private store.
- The execution surface (job list, per-job progress or logs) is reachable by a public route; a job that
  exists only by id is a finding.
- Artifacts exist under the project path only. The project's own check commands pass on them.
- The platform checkout's `git status --porcelain` is unchanged by the execution beat (measure the
  diff caused by this beat, not against a pristine tree).
- Nothing executes before the plan is approved: a prior vague "start now" in the same data dir does
  not authorize execution.
- The reply's completion claims match durable state: a job the reply says ran exists with a terminal
  status, and files it says it wrote exist.
- If the worker cannot verify something within its capabilities, that is stated rather than asserted
  (see [24](24-execution-assurance.md)).
- Prompt 3's answer is traceable: each file maps to a check that the operator can re-run.

## How to measure

- `kampaku jobs show <id>` and the public job list route while work is in flight.
- Filesystem diff of the project path before/after; `git -C <project> status --porcelain` after.
- Run the project's check commands on the produced artifacts.
- `git -C <platform checkout> status --porcelain` before and after the beat.
- Compare the reply's file list against the filesystem diff, in both directions (claimed but missing,
  present but unclaimed).

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Job ids and statuses agree on chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle (a budget stop must be visible, not silent)
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Artifacts are software
- [ ] F2 Checks used are the project's own
- [ ] F3 Only the packages the plan names were touched
- [ ] F4 No existing file overwritten outside the plan
- [ ] F5 Artifacts run via the project's own commands

### Suite-specific

- [ ] Job progress observable on a public surface while running
- [ ] Artifacts exist only under the project path
- [ ] Project checks pass on the artifacts
- [ ] Platform tree unchanged by this beat
- [ ] Reply's claims match the filesystem diff in both directions
- [ ] No execution without an approved plan

### In-scope P-gates

- **P1** required · **P2** required · **P8** if execution touches existing code

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-hands-off-execution.test.ts` | Approved-plan execution produces artifacts in the project path, zero platform writes, visible job records | **To author** |
| Job visibility tests (public list + per-job detail) | Progress is reachable without a private store | Exist; re-run and cite |
| `apps/worker/tests/**` model-agent and tool tests | Worker executes and reports evidence | Exist; re-run and cite |

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
| Jobs created | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

None beyond the intake blocker if the plan could not be created.
