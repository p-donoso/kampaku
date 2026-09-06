# 07 — Plan a human can run

## Promise tested

For a small app, the plan is something an external reviewer can understand and execute in five minutes without the agent — not one monolithic sack.

Non-software plans (novel, research) are owned primarily by suite **18**; this suite remains the software stranger-app cold-read bar.

## Why it elevates

Weak: one leaf "build the app" with vague acceptance. Credible: ordered steps, owners, concrete checks a human could run.

## Prereqs

- Suite 06 pass (stranger project exists).
- Do not require execution completion here; focus on plan quality before or at the start of execution.

## Emperor prompts

1. `For the stranger project, plan a tiny web app: one page that shows Hello Eval, with install, run, and a basic test. Break the work into steps a human could follow without you. Include exact check commands. Do not mark anything done. Wait for my go before large execution.`
2. Hand the plan (from chat, CLI, or UI export) to a second person or to yourself in a cold read: five-minute timer.

Soft note from suite **05**: plan quality is judged only after the emperor confirmed scope — not after a vague improve alone.

## Oracle

- More than one coherent step/leaf; not a single overloaded bag of concerns.
- Each step names what changes and how to verify (commands a human can copy).
- A cold reader can restate the sequence without asking the model.
- No "done" claims from planning alone.
- Plan is visible outside chat (board/CLI) with stable ids.

## How to measure

- Export or screenshot the work breakdown.
- Cold-read timer (pass/fail note).
- Count leaves/steps; flag any step that secretly contains UI+API+infra+tests as one unit.

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

- [ ] Multi-step plan; each step has copy-pasteable checks
- [ ] Cold read ≤5 minutes succeeds
- [ ] Plan ids visible on board/CLI/web; no premature done
- [ ] Automated tests lock plan shape (min leaf count / AC command present)

### In-scope P-gates

- **P6 Human-readable plan** — required
- **P1 Honest done** — planning must not mark done (foreshadows 11)

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
| Cold-read result | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
