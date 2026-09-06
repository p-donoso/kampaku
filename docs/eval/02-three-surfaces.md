# 02 — Three surfaces

## Promise tested

Conversation, CLI, and web show the same truth for the same resource after one trivial mutation.

## Why it elevates

Weak: chat claims success while CLI is stale, or web cannot perform an action CLI can. Credible: one mutation, three consistent views; no orphan surface.

## Prereqs

- Prefer suite 01 **green (10/10)**; if 01 is below 10 only for UI/e2e gaps, this suite may still run to close U3.
- Stack up per [00-protocol.md](00-protocol.md).

## Emperor prompts

1. `Pick one existing project or create the smallest placeholder project if none exists. Then set a short note or display name I can recognize: EVAL-SURFACE-MARKER. Confirm the id.`
2. After chat succeeds: verify via CLI and open the same entity in the web UI. Do not ask the model to "fix" a mismatched surface.

If the product refuses creation without approval, answer the approval once, then continue measurement.

## Oracle

- One durable entity carries `EVAL-SURFACE-MARKER` (or equivalent visible field).
- Chat, CLI, and web report the same id and the same marker.
- No surface is missing the entity while another shows it.
- A failed surface is a suite fail, not "use CLI only".

## How to measure

- Capture id from chat.
- Query the same id via public CLI.
- Open the entity in web; confirm marker text.
- Optional: mutate the marker once via CLI and confirm chat/web catch up without a second invent.

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

- [ ] Marker visible with **same id** in chat, CLI, and web UI content (not HTTP 200 only)
- [ ] Mutating on one surface updates the other two without inventing a second entity
- [ ] Automated tests cover parity (API ↔ persisted field at minimum; UI e2e preferred)

### In-scope P-gates

- None beyond U3 (this suite *is* the three-surface gate)

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
| Entity id | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
