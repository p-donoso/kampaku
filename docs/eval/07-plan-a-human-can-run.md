# 07 — Plan a human can run

## Promise tested

For a small app, the plan is something an external reviewer can understand and execute in five minutes without the agent — not one monolithic sack.

## Why it elevates

Weak: one leaf "build the app" with vague acceptance. Credible: ordered steps, owners, concrete checks a human could run.

## Prereqs

- Suite 06 pass (stranger project exists).
- Do not require execution completion here; focus on plan quality before or at the start of execution.

## Emperor prompts

1. `For the stranger project, plan a tiny web app: one page that shows Hello Eval, with install, run, and a basic test. Break the work into steps a human could follow without you. Include exact check commands. Do not mark anything done. Wait for my go before large execution.`
2. Hand the plan (from chat, CLI, or UI export) to a second person or to yourself in a cold read: five-minute timer.

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

## Pass

- Binary: all oracle bullets hold; cold read succeeds within five minutes.
- Advisor score: __ / 10

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
