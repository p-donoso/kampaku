# 05 — Intent to work

## Promise tested

A vague request triggers clarification or disambiguation **before** flooding the work board with duplicate or invented tracks.

## Why it elevates

Weak: twenty tasks appear from "make it better". Credible: questions first, or a single coherent proposal awaiting confirmation.

## Prereqs

- Suites 01–04 pass.
- Prefer an existing project; do not start a large greenfield yet (suite 06).

## Emperor prompts

1. `Improve the project. Make it better. Start now.`
2. Only if asked a clear question, answer minimally: `Clarify first; do not create more than one proposal track until I confirm.`

## Oracle

- Within the first response cycle, the system asks clarifying questions **or** presents a short options set — before creating a large work tree.
- Work board does not explode with duplicate root tracks for the same vague intent.
- If work is created without confirmation, suite fails unless the product can show the emperor already approved an equivalent intent earlier in this data dir (should not apply on empty-path runs).

## How to measure

- Count work items / goals before and after the first vague prompt (public CLI/UI).
- Capture the clarifying questions shown to the emperor (chat and pending-questions UI if any).
- Note whether execution started without a confirmed scope.

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

- [ ] Vague intent triggers clarify/options **before** board flood
- [ ] No duplicate root tracks from one vague prompt
- [ ] Automated tests lock clarify-before-delegate / no silent flood

### In-scope P-gates

- None beyond U-gates

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
| Work items before / after | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
