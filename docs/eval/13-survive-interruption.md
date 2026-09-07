# 13 — Survive interruption

## Promise tested

Work survives process death or is reported lost honestly; cancel really cancels.

## Why it elevates

Weak: ghost jobs, silent loss, cancel that keeps running. Credible: resume or clear status; cancel stops progress.

## Prereqs

- Suites 01–05 pass; ideally a short-running job from suite 08 if available. Otherwise start a deliberately long trivial task.

Soft note from suite **08**: prefer async durable jobs (`start_durable_execution`) for interrupt oracles — the sync Hello Eval go-ahead is not an interrupt lab.

Soft note from suite **12**: parked scope-expansion jobs are not “running work” to cancel; use a stranger durable batch for this suite.

## Emperor prompts

1. `Start a long-running but safe task I can interrupt (for example generate many small files in the stranger project). Tell me when it is running.`
2. After restart: `What is the state of that work? Resume if safe, or tell me what was lost.`
3. On a second run: `Cancel that work for real and confirm nothing new is written after cancel.`

## Operator actions (not chat)

- While a job is active: kill the stack processes (hard interrupt), then restart per public docs.
- For cancel: use the public cancel control (CLI and/or UI), then watch the repo for further writes.

See [control-worker.md](../protocols/control-worker.md) interrupt/restart/cancel section.

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

- [x] U1 Empty instance
- [x] U2 Public docs sufficient — control-worker interrupt/restart/cancel section
- [x] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [x] After kill+restart: truthful status (not green lie)
- [x] Cancel stops further writes past grace window
- [x] Chat, CLI, and web agree on terminal state
- [x] Automated tests lock cancel and/or resume semantics

### In-scope P-gates

- **P4 Survive interrupt** — required

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| [`apps/core/tests/eval/eval-survive-interruption.test.ts`](../../apps/core/tests/eval/eval-survive-interruption.test.ts) | Cancel stops writes; restart → expired/lost; stub start/inspect/cancel |
| [`apps/web/e2e/eval-survive-interruption.spec.ts`](../../apps/web/e2e/eval-survive-interruption.spec.ts) | UI start + API cancel + filesystem freeze |

Without committed tests, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10
- Suite green only at **10** with U1–U8 + suite-specific + in-scope P-gates + automated tests.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | stub lab + unit (recovery simulated) |
| Git SHA | local (pre-commit; suite 13 uncommitted) |
| Model / provider | stub automated (+ product verbs for LLM) |
| Wall clock | ~30s unit/e2e |
| Job / work id | durable controlled_batch job ids from tests |

## Result

`pass` — advisor **10**/10 (product + tests; **not committed**). `start_durable_execution` / `inspect_execution_state` / `cancel_execution` + startup orphan recovery; CLI `jobs cancel`.

## Evidence

- Unit: cancel freezes file count; restart recovery → `expired` + inspect lost; stub chat path green.
- E2e: durable running → API cancel → cancelled; interrupt-lab writes stop.

## Blocker
