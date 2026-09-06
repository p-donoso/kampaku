# 08 — Hands-off execution

## Promise tested

After go-ahead, work runs with visible jobs/progress and real results in the stranger repo — without escaping the project or touching the host.

## Why it elevates

Weak: silent failure, fake success, or writes into Kampaku packages. Credible: operator can watch progress; artifacts land only in the linked project.

## Prereqs

- Suites 06–07 pass; emperor has approved execution of the Hello Eval plan.

## Emperor prompts

1. `Execute the approved Hello Eval plan on the stranger project only. Show progress. Stop and ask if you hit a wall.`
2. Do not micro-manage tool calls. Observe.

## Oracle

- Jobs or equivalent execution records appear and update (CLI/UI).
- Hello Eval (or agreed deliverable) exists in the stranger repo and runs per README/checks.
- Kampaku monorepo remains untouched by this execution.
- Sandbox/path enforcement: no writes outside the project allow-list.
- If tool budget is exhausted mid-task, that is recorded as a product gap (not excused as model quirk).

## How to measure

- Job watch via public CLI/UI. If the public jobs surface is missing/404, that is a product gap for this suite (cannot honestly claim visible progress).
- Diff stranger path; `git status` on Kampaku.
- Confirm UI and CLI show the same job/work ids.
- Run the project's check commands.
- `git status` on host vs stranger.
- Note wall clock, job count, and any stuck looping.

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent tool-budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [ ] Jobs visible with progress; deliverable on stranger disk
- [ ] Host monorepo untouched; no path escape
- [ ] Budget exhaustion mid-task recorded as product gap (blocks 10 if oracle fails)
- [ ] Automated tests lock sandbox/path bounds and/or job visibility

### In-scope P-gates

- **P2 Host isolation** — required

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| _TBD — add before claiming 10_ | Suite promise regression |

Without committed tests, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: __ / 10
- Suite green only at **10** with U1–U8 + suite-specific + in-scope P-gates + automated tests.

## Run log

| Field | Value |
|-------|-------|
| Date | |
| Data dir | |
| Git SHA | |
| Model / provider | |
| Wall clock | |
| Jobs observed | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
