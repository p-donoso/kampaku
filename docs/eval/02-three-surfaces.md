# 02 — Three surfaces

## Promise tested

Conversation, CLI, and web show the same truth for the same resource after one trivial mutation.

## Why it elevates

Weak: chat claims success while CLI is stale, or web cannot perform an action CLI can. Credible: one mutation, three consistent views; no orphan surface.

## Prereqs

- Suite 01 binary pass on this data dir (or re-run 01 fresh).
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

## Pass

- Binary: all oracle bullets hold.
- Advisor score: __ / 10

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
