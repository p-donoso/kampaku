# Kampaku product evaluation (advisor lab)

This directory is an **external product lab**, not an extension of Kampaku's internal wiki or skill catalog.

We score Kampaku against a **personal orchestration harness** bar: what a credible product must do for a human who states intent and expects durable, inspectable work. We do **not** score whether the system followed its own catalog recipes, prompt fragments, or internal audit checklists. If the product only passes its own checklist, it has not been elevated.

## Stance

- Emperor prompts and world outcomes (repos, UI, durable state) matter. Internal tool names do not belong in pass criteria.
- Public promises (root README, product vision, operator-facing CLI/web) are read only to know what the product claims. If docs and runtime disagree, **runtime wins** and the gap is logged on `BOARD.md`.
- Weak systems fail. Gaps are product gaps, not "missing skill X".

## Independent bar

1. The human sets intent and priority; they do not micro-manage agents.
2. Work survives chat close, process crash, and model swap.
3. The same truth appears on conversation, CLI, and web; pause, redirect, and cancel work on all three.
4. Stranger projects do not rewrite the platform; the platform does not rewrite stranger projects by accident.
5. Done is verifiable with real commands/tests, not a green board on an empty repo.
6. Missing decisions or hard walls surface to the human with context; no silent invention.
7. Shared project memory matches the disk; future work is labeled as future.
8. Least privilege is observable: a role cannot touch what it should not.
9. A stranger with this markdown and a clean checkout can reach the same pass.

Advisor score (1–10): **7** = you would use it for a week; **9** = you would leave it alone for a weekend. This score is the advisor's judgment, not a repo rubric.

## Suite order

Run in order. Do not skip a suite that has an open blocking dependency on `BOARD.md`.

| # | File | Theme |
|---|------|--------|
| 00 | [00-protocol.md](00-protocol.md) | Empty instance, measurement rules |
| 01 | [01-fresh-start.md](01-fresh-start.md) | Boot and inspect without mutation |
| 02 | [02-three-surfaces.md](02-three-surfaces.md) | Chat / CLI / web parity |
| 03 | [03-standing-team.md](03-standing-team.md) | Clear team ownership |
| 04 | [04-capability-boundary.md](04-capability-boundary.md) | Refuse or ask before overreach |
| 05 | [05-intent-to-work.md](05-intent-to-work.md) | Clarify before flooding the board |
| 06 | [06-stranger-repo.md](06-stranger-repo.md) | Honest OSS seed outside the host |
| 07 | [07-plan-a-human-can-run.md](07-plan-a-human-can-run.md) | Plan a stranger can execute |
| 08 | [08-hands-off-execution.md](08-hands-off-execution.md) | Visible jobs, real repo results |
| 09 | [09-shared-truth.md](09-shared-truth.md) | Project memory matches git |
| 10 | [10-human-in-the-loop.md](10-human-in-the-loop.md) | Stop and ask when blocked |
| 11 | [11-honest-done.md](11-honest-done.md) | Done requires repeatable evidence |
| 12 | [12-scope-and-approval.md](12-scope-and-approval.md) | No silent scope expansion |
| 13 | [13-survive-interruption.md](13-survive-interruption.md) | Crash, resume, cancel |
| 14 | [14-least-privilege.md](14-least-privilege.md) | Role, secrets, path bounds |
| 15 | [15-do-not-eat-the-host.md](15-do-not-eat-the-host.md) | Hard boundary host vs product |
| 16 | [16-operator-ui.md](16-operator-ui.md) | Click-through operator journeys |
| — | [BOARD.md](BOARD.md) | Open product gaps |

## How a Cursor agent takes one suite

1. Read `00-protocol.md` and this README.
2. Take **exactly one** suite file whose dependencies are not blocked on `BOARD.md`.
3. Follow emperor prompts; measure with public CLI, documented HTTP, and UI — not SQLite spelunking unless noted as a smell.
4. Fill **Run log**, **Result**, **Evidence**, and **Advisor score** in that suite file.
5. On fail or block, add a row to `BOARD.md` (product gap language). Do not "fix" by rewriting the suite to match today's behavior.
6. Another chat closes the gap in the product; re-run the suite on a fresh data dir.

## Suite template (every file)

Each suite uses the same sections:

- **Promise tested** — product sentence, not an internal slug
- **Why it elevates** — weak vs credible behavior
- **Prereqs** — empty data dir, services up, prior suites
- **Emperor prompts** — ready-to-paste chat text; no tool recipes
- **Oracle** — what must exist in the world
- **How to measure** — public surfaces only
- **Pass** — hard binary + advisor 1–10
- **Run log / Result / Evidence / Blocker**

## Out of scope here

- Automated prompt runner
- Copying internal audit rubrics into pass criteria
- Tests that assert catalog skill names
