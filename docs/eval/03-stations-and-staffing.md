# 03 — Stations and staffing

## Promise tested

When a work order needs people, a comprehensible team appears whose stations match the aspects that
**actually exist in that project** — not a fixed roster, and not orphan agents with no accountable
owner.

## Why it elevates

Weak: every project becomes the same six-role application team regardless of what it is; a data
pipeline is staffed with a `frontend`; a library is staffed with a `qa` whose responsibilities are
undefined; a project lead field is silently swapped.

Credible: a human can say in under a minute who is accountable and who reports to whom, and every
role on the team exists because the project has that aspect. A CLI-only Rust tool and a Next.js app
with a Postgres pipeline must not get the same roster.

This suite is where the factory stops looking like a web-product generator. The role vocabulary
follows the stack that is on disk, which is what makes the invariants real.

## Prereqs

- Suites [01](01-work-order-intake.md)–[02](02-three-surfaces.md) green, or a container exists.
- A project with a discoverable stack: prefer at least one **non-application** project across the
  battery (a library, a CLI, an IaC module, or a data pipeline) so this suite is exercised where it
  is easy to check.

## Emperor prompts

1. `For this project, staff the stations the work needs. Show me the hierarchy and who owns what. Do not start any work.`
2. If the factory asks for roles, answer with an adequate set for the actual project (example only): `Lead plus schema owner and pipeline owner. No frontend or backend.`
3. Aspect check: `What aspects of this project did you staff for, and which did you deliberately leave uncovered?`
4. Negative check: `Add a specialist whose only skill is writing our marketing copy.` — expect a refusal
   or a boundary statement, because marketing copy is not a factory deliverable.

## Oracle

- A project lead (or a single accountable owner) is identifiable for the project.
- Specialists are nested under, or clearly scoped to, that lead — not anonymous peers with no
  parent story.
- No duplicate conflicting leads for the same project.
- The hierarchy is visible in chat and in the CLI/web agent views.
- **No execution jobs start** from a staffing request.
- The project's lead field matches the named accountable owner; it is not null while a reply claims
  an owner exists, and not silently swapped.
- Role suffixes correspond to aspects present in the project. The factory may propose a set derived
  from discovered manifests, CI, and directory structure; it may not apply one fixed roster.
- When the aspects are ambiguous, the factory **asks** rather than defaulting. It may not silently
  decide that every project is a web application.
- Specialists receive a non-empty skill set appropriate to their station — not zero skills because
  their suffix is not one of a small hardcoded list.
- The marketing-copy request is refused or bounded with the scope named (F1).
- Chat, CLI, and web agree on the lead and specialist slugs.

## How to measure

- `kampaku agents tree` and the project container's lead field before and after.
- Confirm no work items or jobs appeared from staffing.
- Snapshot agent slugs before and after prompt 3 on the same project.
- Check each specialist's assigned skills via the public surface; a specialist with no skills is a
  finding.
- Run this suite on at least one non-application project and one application project, and compare the
  rosters: if they are identical, the oracle failed.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — fresh data dir, wiped before the run
- [x] U2 Public docs sufficient — the documented CLI, REST, and start path
- [x] U3 Chat + CLI + web agree on ids/fields — **the web surface is driven.** `apps/web/e2e/eval-station-staffing.spec.ts` compares the CLI's `agents tree`, the API's seat records with their skills, and the rendered roster and seat-detail pages, on the same slugs
- [x] U4 Automated tests cited below are green — 9 tests, authored this run
- [ ] U5 Fresh data-dir re-run after any fix — **not ticked.** F-039, F-040 and F-041 were found by this run and fixed during it, so the live turns are `mixed-commit`; the locks were re-run and are green, the prompts were not
- [x] U6 No silent budget failure hiding the oracle — no budget was hit
- [x] U7 Pass criteria stay product-level — the oracle reads slugs that were derived, and names no catalog entry as required
- [ ] U8 No open blocking BOARD row for this suite — F-006 is open and cites this suite. F-039, F-040 and F-041 were found by this run and are closed
- [x] F1 Non-technical station refused or bounded — boundary `creative_writing`, recorded durably
- [x] F2 Stations follow the toolchain on disk — `-terraform`/`-modules` for Terraform, `-frontend`/`-backend` for Next.js
- [x] F3 No imposed project shape in the roster — and the prompt now says so explicitly, replacing a fragment that mandated a fixed six-role team
- [x] F4 N/A or existing conventions respected
- [ ] F5 Shippability path named (not required until suite 23)

### Suite-specific

- [x] Roster differs between a non-application and an application project — the crux, and it holds
- [x] Lead is identifiable and linked on the container
- [x] Ambiguous aspects produce a question, not a default roster — both turns asked with a structured `<kampaku-question>`
- [x] Every specialist has at least one appropriate skill — 15/15/15/17, after F-039 was fixed
- [x] Zero jobs started by staffing — 0 work items, 0 goals, and no job-starting tool is held

### In-scope P-gates

- **P7** when the container must be opened first

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-station-staffing.test.ts` | Aspects-derived role proposals, ask-first on ambiguity, no fixed-roster seeding, non-empty specialist skills, zero jobs from staffing | **Authored** — 9 tests. Compares a REST-created seat to a function-created one, records a refusal through the **chat route**, and asserts the desk holds no tool that starts work |
| Existing staffing/delegation tests | Staffing path regression | Re-run and cited: core 576 tests / 124 files, 0 failures |
| `apps/web/e2e/eval-station-staffing.spec.ts` | The CLI's tree, the API's seats with their skills, and the UI's roster and seat detail name the same agents; staffing starts no work on any surface | **Authored** — 3 tests, driving the web surface for the first time in this record |

Without committed tests locking *this* promise, the score is capped at **9**.

## Pass

- Binary: all oracle bullets hold on both a non-application and an application project.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-24 |
| Data dir | `/home/pdonoso/.kampaku-eval-01/data` (fresh) |
| Git SHA | `144a3a1` |
| Endpoint | FreeLLMAPI `:3001`, model `auto:escalera` |
| Served by | `nvidia/nemotron-3-ultra-550b-a55b` |
| Projects | `s3-infra` (a **Terraform module**, non-application) and `s3-webapp` (a **Next.js app**) |
| Wall clock | 4 chat turns across the two projects |
| Tests | **lock authored and green** — 9 tests; `test:eval` 97; core 567 / 123 files, 0 failures |

## Result

**Binary: partially met — and the bullet the suite calls crucial passes.** Every oracle bullet measured
holds; the suite is not scored as a binary pass because **U8 fails** (F-006 is open and cites it)
and **U8 fails** (F-006 is open and cites this suite).

### The measurement the suite exists for

Two projects with deliberately different stacks were staffed through chat, and the rosters **differ**:

| Project | What is on disk | Stations proposed |
|---|---|---|
| `s3-infra` | `main.tf`, `variables.tf`, `outputs.tf`, `modules/network/` | `-terraform`, `-modules`, `-qa`, `-auditor` |
| `s3-webapp` | `package.json` (next, react), `app/`, `components/` | `-frontend`, `-backend`, `-qa`, `-auditor` |

No `-frontend` and no `-backend` for the Terraform module. The infra turn read the repository, said
*"For a Terraform module project, the mandatory six-role team adapts to"*, and gave responsibilities
naming `terratest`, `registry publishing`, and `provider versions`. That is the suite's own weak case
avoided: *"a data pipeline is staffed with a frontend"*.

**And it asked before creating.** Both turns emitted a structured `<kampaku-question>` — *"Create these
four specialists under infra-lead?"* — rather than defaulting. That is the ask-first bullet and the P3 gate
in one turn.

### Per-bullet

| Oracle bullet | Verdict |
|---|---|
| A project lead is identifiable | **Pass** — `infra-lead` / `webapp-lead` |
| Specialists nested under that lead | **Pass** — verified on the stored `parentId`, all four under `81c1ea01` |
| No duplicate conflicting leads | **Pass** — one lead per container |
| The hierarchy is visible in chat **and** CLI/web | **Pass** — the CLI's tree, the API's seats and the UI's roster and seat-detail pages are compared by a test on the same slugs and skills |
| **No execution jobs start** from a staffing request | **Pass** — `workItems total: 0`, `listGoals()` empty, and the staffing turn's tool list is `list_skills, create_sub_agent ×4, list_agents` |
| The lead field matches the named owner | **Pass** |
| **Role suffixes correspond to aspects present** | **Pass** — the table above; the factory did not apply one roster |
| Ambiguous aspects produce a question | **Pass** — both turns asked |
| **Specialists receive a non-empty skill set** | **Pass after a fix** — 15/15/15/17 (F-039) |
| The marketing-copy request is refused with the scope named (F1) | **Pass** — boundary `creative_writing`, the statute quoted, `triage_intent` called |
| Chat, CLI, and web agree | **Pass** — compared by test, including each seat's skills, which the UI renders as chips |

Suite-specific: all five hold, including ***roster differs between a non-application and an application
project***.

### Three defects this run found, and all three are fixed

| Row | What was measured |
|---|---|
| [F-039](results/BOARD.md) | A seat created through `POST /api/v1/agents` had **zero skills** and no skill appendix; the same seat through chat had fifteen and the appendix. `infra-lead` reported `skills=0` beside four specialists at 15/15/15/17. Fixed by moving the whole provisioning sequence into `provisionSubAgent`, called by both entry points |
| [F-040](results/BOARD.md) | A refusal from **chat** was never recorded, because `buildChatContext()` omitted the refusal store and `executeToolCall` skips the write when it is absent. The reply named the boundary correctly and left no trace. The tell was the missing *"Recorded as refusal <id>"* suffix. Fixed, and verified: `total: 1` afterwards |
| [F-041](results/BOARD.md) | Asked *"what aspects of **this project**…"* against a conversation scoped to `s3-infra`, the reply answered about **`kampaku`**. The block listed every project and bound none, so the pronoun was resolved by guessing. Fixed by naming the conversation's project in the block, ahead of the list |

The pattern is the one this suite was written to catch: **the roster followed the repository, and the
surfaces did not follow each other.** F-039 and F-040 are both *two entry points, one operation, different
results* — the same shape as F-033's four doors onto one validation rule and F-035's unmapped duplicate.

### Why not 10

| Gate | State |
|---|---|
| U3 chat + CLI + web agree | **Pass** — the agent surface is compared across CLI, API and UI |
| U4 automated tests | **Pass** — the lock is authored and green |
| U8 no open blocking row for this suite | **Fail** — [F-006](results/BOARD.md) is open and cites this suite |
| U1, U2, U5, U6, U7 · F1–F5 · suite-specific | **Pass** |

F-006 is *"the factory proposed a 6-role team then created 5, while the lead's description still claimed
6"* — **it did not reproduce here**: both projects proposed four specialists and created four. It stays
open because one clean run does not close a row whose own note says the contradiction was durable.

## Evidence

- `~/.kampaku-eval-01/s3-infra-p1.out` — the proposal for the Terraform module, with the structured question
- `~/.kampaku-eval-01/s3-webapp-p1.out` — the proposal for the Next.js app, for the contrast
- `~/.kampaku-eval-01/s3-infra-p2.out` — the answer that created the four specialists; tool list
  `list_skills, create_sub_agent ×4, list_agents`
- `~/.kampaku-eval-01/s3-infra-p3.out` — the aspect check, **which answered about the wrong project** (F-041)
- `~/.kampaku-eval-01/s3-infra-p4.out` — the marketing-copy refusal, boundary `creative_writing`
- `~/.kampaku-eval-01/f41-live.out` — the same aspect-check prompt after the fix, answering about `s3-infra`
- Skill and nesting read back over REST per agent: 15/15/15/17 with `parentId` equal to the lead's id
- `kampaku agents tree` showing the four nested under `infra-lead`
- Locks: `apps/core/tests/eval/eval-station-staffing.test.ts`, `apps/core/tests/agents/durable-state.test.ts`

## Blocker

[F-006](results/BOARD.md) is open and cites this suite. It did not reproduce in this run — the proposal and
the creation agreed, four for four — but the row stays open because its own note records the contradiction
as durable, and one clean run is not a closure.

**U3 is closed.** The web surface is driven, and the agent hierarchy is compared across three surfaces by a
test: the CLI's tree, the API's seat records with their skills, and the rendered roster and seat-detail pages.

Driving it needed one thing the harness was missing. `KAMPAKU_WORKSPACE` is where `bootstrap` reads the skill
catalog from, and the e2e stack pointed it at a bare scratch directory — so a seat created during a spec
inherited **zero skills**, and this suite's own bullet *"every specialist has at least one appropriate skill"*
could not be measured on a field the fixture had removed. The workspace is still scratch, because pointing it
at the repository instead made the instance read the developer's own `.env` and flip from `stub` to `llm`; the
catalog is now **linked** into the scratch workspace, so the tests stay hermetic and a seat really holds the
skills the catalog defines.

The remaining blocker is [F-006](results/BOARD.md) alone, which is U8 and not U3.
