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

A gate is answered **in the web UI**, and the answer has to reach the conversation that asked it. Since run
`s03r3` the durable block carries the last few answered gates with the decision that was taken, and says a
taken decision is a constraint rather than a topic to reopen — so a follow-up turn that asks the answered
question again is a finding ([F-062](results/BOARD.md)). If a later turn believes the decision no longer
fits, the protocol is to say what changed and ask for **that** change; restating the original question
unchanged spends the answer the operator already gave.

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
  their suffix is not one of a small hardcoded list. **"Non-empty" is not "appropriate"**: a station
  holding the thirteen workflow defaults and nothing about its aspect is capability-short, and the reply
  must say so instead of counting the defaults as coverage (F-006, F-022).
- **The reply's roster is the roster the store holds.** Every station the proposal named either exists
  under the lead, with the skills the store grants it, or the difference is named: which station was not
  created and why, which skill was not granted and what the seat holds instead. A reply that describes a
  team the tree contradicts fails this bullet even when the turn created everything it intended.
- The marketing-copy request is refused or bounded with the scope named (F1).
- Chat, CLI, and web agree on the lead and specialist slugs.

## How to measure

- `kampaku agents tree` and the project container's lead field before and after.
- Confirm no work items or jobs appeared from staffing.
- Snapshot agent slugs before and after prompt 3 on the same project.
- Check each specialist's assigned skills via the public surface; a specialist with no skills is a
  finding.
- Read the roster the turn itself was given — `create_sub_agent`'s result carries the seats under the lead
  with their skills and one finding per difference from the proposal — and compare it against the reply and
  against `GET /api/v1/agents`. Three surfaces, one roster.
- **Drive the difference path deliberately, once.** Name a station (or a skill) that cannot exist — a
  reserved slug, a duplicate, a skill slug the catalog does not hold — and check that the reply names it.
  A clean run does not exercise this bullet, and this is the bullet F-006 needed and no run had measured.
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
- [x] U8 No open blocking BOARD row for this suite — **F-006 closed 2026-10-19 on evidence** (fix, a lock verified red without it, and a deliberate difference path re-measured on a fresh data dir). F-039, F-040 and F-041 were found by this run and are closed; **F-111** was opened on run `s03r3` (2026-10-19) and is closed
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
| `apps/core/tests/eval/eval-station-staffing.test.ts` | Aspects-derived role proposals, ask-first on ambiguity, no fixed-roster seeding, non-empty specialist skills, zero jobs from staffing; **and the roster a staffing call reports is the tree, with every difference named** | **Authored** — 12 tests. Compares a REST-created seat to a function-created one, records a refusal through the **chat route**, asserts the desk holds no tool that starts work, and locks F-006 (3 cases, **red without the fix: 3 of 3**) |
| `apps/core/tests/agents/durable-state-answered-gates.test.ts` | An answered gate reaches the next turn: the decision in the block, scoped per project and bounded, rendered as settled, placed after the history that carries the question | **Authored** — 6 tests, verified **red without the fix** (6 of 6 failed) |
| `apps/core/tests/eval/eval-question-id-reuse.test.ts` | A question id is the model's, not a decision: a reused id carrying a different decision is stored as its own gate, one decision under two fresh ids is one gate, and a gate the store refused is never rendered | **Authored 2026-10-19** — 5 tests, red before the fix (`3 failed, 2 passed`) |
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
| **The reply's roster is the roster the store holds** | **Pass after a fix** — the result carries the seats under the lead with their skills and names every difference; re-measured on `f006r1` by proposing a skill the catalog does not hold (F-006) |
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
| U8 no open blocking row for this suite | **Pass** — [F-006](results/BOARD.md) was closed on 2026-10-19 on evidence, not on a clean run |
| U1, U2, U5, U6, U7 · F1–F5 · suite-specific | **Pass** |

### F-006 — the roster said six and the tree held five, and a substituted skill was only a sentence (closed 2026-10-19)

F-006 is *"the factory proposed a 6-role team then created 5, while the lead's description still claimed
6"*. On run `s03r3` **it did not reproduce as a seat count** — each staffing turn proposed five stations and
created five, and `GET /api/v1/agents` agreed with both returns. It did reproduce as a **capability count**,
which is the same defect in a smaller place, and that is the shape that closed the row:

> The lead's proposal named skill slugs that do not exist in this factory's catalog (`nextjs-app-router`,
> `react-components`, …). I did not create agents with dangling skills — I mapped each station to skills
> that exist.

The roster was created as proposed; the **skills** were substituted. `create_sub_agent` answered
`{id, slug, name}` — a receipt — so nothing in the turn's own results could tell it what the seats it had
just made actually held. The reply was right and had no support: the substitution survived as one sentence
the model chose to write, and a turn that had not chosen to write it would have described five stations with
six capabilities nobody granted.

**What changed.** `create_sub_agent` now returns the roster, read from the stores: the seats that exist under
that lead with the skills assigned to each, plus one finding per difference from the proposal — a station
that was not created with the store's own refusal reason, and a skill that was not granted with what the seat
holds instead (`apps/core/src/delegator/roster-reconciliation.ts`, `assessStaffingRoster`; the shape is
`assessPlanRoster`'s). A refusal is a result rather than a throw, so a partial staffing is a stated outcome:
the seats that exist, and by name the one that does not. An unknown skill is skipped instead of aborting a
create that has already written the seat — that asymmetry is what made the old behaviour incoherent (the
station existed, the caller was told the call failed, and a retry hit `already exists`). The REST route
answers the same block, so the two entry points cannot report different teams (F-039's rule one field over),
and the stub path's unconditional *"Created sub-agent X"* reads the result too.

**Lock.** `apps/core/tests/eval/eval-station-staffing.test.ts` — *"F-006 — the roster is the tree, and every
difference is named"*, three cases: a station refused by the store is named with its reason while the roster
reports only the seats that exist; a partly unknown skill list produces `skill_not_granted` naming both what
was asked for and what the seat holds; and one of five stations refused leaves four created, the fifth named,
with a clean staffing of the same four producing no findings at all. Verified **red without the fix: 3 of 3
failed**, including the pre-fix signature `SkillStoreError: Skill "nextjs-app-router" not found.` thrown
after the agent row had already been written.

**Re-measured on the difference path, deliberately** (`f006r1`, fresh data dir, own port `28007`, git
`618e4c9` + this change). A clean run cannot close this row, because a clean run is the state that hid it, so
the measurement names a capability the catalog does not hold:

- `POST /api/v1/agents` with `skill_slugs: ["terraform-modules-v2", "docs-writer"]` → `201`, and the
  response carries the roster block: both seats with their skills, and
  `- [skill_not_granted] "f006-docs" was proposed with skill "terraform-modules-v2", which this factory's
  catalog does not hold. The seat holds docs-writer, … instead.` (`logs/diff-path.json`)
- A **chat** turn told to pass that slug unchanged (`logs/chat-diff.out`): the tool returned the roster, and
  the reply named the finding verbatim, said the seat is *"capability-short for its station"*, refused to
  present thirteen defaults as coverage, and asked how to close the gap — the behaviour this suite's oracle
  asks for, and the behaviour the row was opened because it could not be relied on.
- `GET /api/v1/agents` agrees with both: `f006-lead` 14 skills, `f006-docs` 14, `f006-network` 13, and no seat
  holds `terraform-modules-v2` (`logs/agents-after.json`).

**Deliberately not folded in:** [F-022](results/BOARD.md) — authoring the skill the catalog lacks — is what
makes a substitution unnecessary; this row is about *saying* what happened, and the fix does not turn a
substitution into a refusal to staff.

### F-111 — a question id is the model's, so a new decision under a familiar id was stored nowhere (2026-10-19)

Found on run `s03r3`, which took this suite on a fresh data dir at git `618e4c9`. Both projects staffed from
repository evidence and both turned an ambiguous aspect into a structured question, which is this suite's
ask-first bullet working. The defect is what happened to those questions afterwards:

- `p0-infra` raised `<kampaku-question id="s3-infra-docs-station">` — *"Keep the five stations as staffed, or
  add a sixth documentation station for the module's inputs/outputs reference?"* — and it was answered through
  the Web UI (`gates auto`: `gate 08a33493-49ac-4719-a1b6-aab20122e899: answered — Keep the five stations…`).
- `p1-infra`, the next turn, asked a **different** decision under the **same** id — *"Documentation is the one
  uncovered aspect with real work behind it … how should it be owned?"*, three options.
- `GET /api/v1/questions` afterwards held **one** record, the answered one. The second decision lived only in
  the reply: `suite-loop.py --run s03r3 gates auto` reported `0 answered, 0 left pending`, and the reply the
  operator read carried a `required: true` gate.
- Same shape again on `p2-infra` and `p1-webapp`.

`QuestionStore.askEmperor` deduped on the question id across all statuses, and the id is chosen by the model —
so a familiar id read as a familiar question. The idempotence is required (a repeating asker looped the probe
when every repetition after an answer became a new pending gate); the **key** was wrong.
`persistEmperorQuestion` also discarded the `created: false` it was handed, which is what made the swallow
silent.

**Fixed in the same change as the row**, with three properties: the id **and** `questionSignature` must both
match, so a reused id carrying a different decision opens a new gate while an identical decision under a fresh
id stays one; the reply is rewritten when the store declines, naming the record and its answer instead of
rendering a gate no surface holds; and the transcript stores the text the operator read.

Lock: `apps/core/tests/eval/eval-question-id-reuse.test.ts`, 5 tests, **red before the fix** (`3 failed,
2 passed` — the two that pass are the loop-closed controls). Live re-measurement on run `f111r1` (fresh data
dir, its own port, git `618e4c9` + the change), reading `GET /api/v1/questions` after each turn:

| Turn | What was asked | `GET /api/v1/questions` after it |
|---|---|---|
| p0 | lead reconciliation, id `f111-infra-lead-reconciliation` | **1** record, answered through the API |
| p1 | a different decision under the same id — *"How should the missing README inputs/outputs documentation be owned?"* | **2** records; the new one `pending` and carrying the gate |
| p2 | the identical decision re-emitted | **2** records; the reply carries **no** `<kampaku-question>` and says *"already on record and still waiting for you"*, and the stored message is byte-equal to it |

What this changes about the suite's verdict: not the score. The ask-first bullet still passes and the questions
it asks now outlive the turn that asked them, but `s03r3` is `mixed-commit` — the defect was found on it and
fixed after it — so **U5 stays unticked**, and **U8 still fails on F-006**. F-111 is closed by the
re-measurement above, not by the run that found it.

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

## An answered gate is not re-asked — run `s03r3`, 2026-10-19

This suite asks for a decision in its first turn of each project, which makes it the suite that finds out what
happens to the answer. Run `s03r3` (fresh data dir, git `618e4c9`, five driven turns across `s3-infra` and
`s3-webapp`) answered both gates through the web UI and watched **both** follow-up turns ask the same decision
again:

| Project | Gate | Answer | The next turn asked |
|---|---|---|---|
| `s3-infra` | `08a33493-…` — keep five stations or add a documentation one | `Keep the five stations — document within existing stations` | *"Documentation is the one uncovered aspect with real work behind it … how should it be owned?"* |
| `s3-webapp` | `c4c834c0-…` — a real S3-backed UI, or the skeleton | `Real S3-backed UI — data comes from an external service this app consumes` | *"Does this app consume an external service for /items, or should it serve its own route handlers?"* |

Both answers were in the store (`GET /api/v1/questions/<id>` → `answered`, with the value) and neither appeared
anywhere in the next turn's context: `snapshotForPrompt` carried `openGates` from `list("pending")` and nothing
else, and `buildHistoryContext` replays **messages** — the question is in the assistant's reply, the answer is a
row on the question and never a message. It is [F-062](results/BOARD.md), and it is the third corner of the same
defect as [F-049](results/BOARD.md) (an asker that could not see its own *pending* gate repeated itself) and
[F-050](results/BOARD.md) (the front office could not enumerate pending gates at all): this one is *answered*.

Fixed in the block rather than in the conversation, because the two re-asking turns both recorded `tools: none`
— a fact only a tool call can reach is a fact such a turn will deny. The block now renders the five most
recently decided gates per project with the operator's own wording, states that they are settled, and tells the
reader to ask for a change rather than the original question again. **Measured on a copy of this run's data
dir, in this run's own conversations:** the block handed to `s3-infra`'s follow-up carries
`DECIDED … Keep the five stations — document within existing stations` and the reply answers *"Documentation —
settled, not open … I'm not reopening it"* with no question in it; `s3-webapp`'s gate was answered through
`POST /api/v1/questions/<id>/answer` during the measurement, and its next turn renders both decisions and
answers *"that aspect stays uncovered by decision, not by omission"*, no question in it. Lock:
`apps/core/tests/agents/durable-state-answered-gates.test.ts` (6 tests), verified red without the fix — 6 of 6
failed. Transcript: `.kampaku/runs/s03r3/logs/s03r3-f062-live-measurement.md`.

This does not change the 2026-09-24 score below, and it does not claim a resume: an answer to a question with no
work item parks nothing, and `describeAnswerOutcome` still says so. What changed is the conversation's own
context. Resuming parked work stays [F-007](results/BOARD.md).

**F-111** ([BOARD](results/BOARD.md)) was opened on run `s03r3` and closed the same day — see
*F-111 — a question id is the model's* above. It does not move the blocker: **F-006** alone is still U8.
