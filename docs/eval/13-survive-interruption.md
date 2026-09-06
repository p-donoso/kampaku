# 13 — Survive interruption

## Promise tested

Work survives process death or is reported lost honestly; cancel really cancels.

## Why it elevates

Weak: ghost jobs, silent loss, cancel that keeps running. Credible: resume or clear status; cancel stops progress.

## Prereqs

- Suites 01–05 pass; ideally a short-running job from suite 08 if available. Otherwise start a deliberately long trivial task.

## Emperor prompts

1. `Start a long-running but safe task I can interrupt (for example generate many small files in the stranger project). Tell me when it is running.`
2. After restart: `What is the state of that work? Resume if safe, or tell me what was lost.`
3. On a second run: `Cancel that work for real and confirm nothing new is written after cancel.`

## Operator actions (not chat)

- While a job is active: kill the stack processes (hard interrupt), then restart per public docs.
- For cancel: use the public cancel control (CLI and/or UI), then watch the repo for further writes.

## Oracle

- After restart, status is truthful: running, queued, failed, or lost — not a green lie.
- If resume is claimed, progress continues without duplicating completed side effects blindly (or duplicates are acknowledged).
- After cancel: no new artifacts appear for that job past a short grace window.
- Chat, CLI, and web agree on the terminal state.

## How to measure

- Job/work status via CLI/UI before kill, after restart, after cancel.
- Filesystem watch on the target repo during cancel window.
- Wall clock and whether the product required secret tribal recovery steps (lift smell).

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

- [ ] After kill+restart: truthful status (not green lie)
- [ ] Cancel stops further writes past grace window
- [ ] Chat, CLI, and web agree on terminal state
- [ ] Automated tests lock cancel and/or resume semantics

### In-scope P-gates

- **P4 Survive interrupt** — required

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
| Job / work id | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
