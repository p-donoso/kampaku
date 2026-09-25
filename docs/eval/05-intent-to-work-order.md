# 05 — Intent to work order

## Promise tested

A vague request produces clarification or a small options set **before** the board floods with
invented tracks — and a healthy instance does not generate phantom "missing foundation" work.

## Why it elevates

Weak: twenty work items appear from "make it better"; an empty instance produces imaginary CI, vision,
and repository setup; "start now" is treated as confirmed scope.

Credible: the factory asks what the emperor actually wants, or proposes exactly one coherent track and
waits.

## Prereqs

- Suites [01](01-work-order-intake.md)–[04](04-capability-boundary.md) green.
- Prefer an instance that already has a project and a team, so the phantom-foundation oracle applies.

## Emperor prompts

1. `Improve the project. Make it better. Start now.`
2. Only if asked a clear question: `Clarify first; do not create more than one proposal track until I confirm.`
3. Healthy-instance check: `What must I decide right now?`
4. Ambiguity check: `Make the thing we discussed work on mobile.` (deliberately under-specified: no
   platform, no target, no scope boundary)

## Oracle

- Within the first response cycle, the factory asks clarifying questions **or** presents a short
  options set, before creating a large work tree.
- The board does not explode with duplicate root tracks for the same vague intent.
- If work is created without confirmation, the suite fails unless the product shows the emperor
  approved an equivalent order earlier in this data dir (which does not apply on an empty-path run).
- Prompt 3 on a healthy instance does **not** invent missing foundation (no imaginary onboarding, no
  "your repository has no CI" when a CI workflow exists). It asks about next intent, or answers that
  nothing is blocking.
- Prompt 4 produces a question that names the concrete missing decisions (which platform, which
  surface, whether the current behavior changes), not a generic "please provide more detail".
- No jobs start from any prompt in this suite.
- Clarification never silently restaffs the project or changes its architecture.
- The clarification is a durable record where the product claims one: a question asked in this suite
  is visible in `questions list` and answerable, or the suite records that the clarification was
  prose-only as a finding.

## How to measure

- Count work items, jobs, and agents before and after each prompt (public CLI/UI).
- Capture the clarifying questions as shown to the emperor, including whether each names a concrete
  decision.
- Confirm no execution started without an approved plan.
- For prompt 3, list what the factory claims is missing and check each claim against disk.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — fresh data dir wiped and recreated, `bootstrap` then `serve`, one instance for the
  whole run (`docs/eval/00-protocol.md`). Recorded departure: the fixture repository sits at `/tmp/intent-demo`,
  which is **outside** the bootstrap's allowed folders, so the emperor's own prompt was refused until the folder
  was granted with the documented `kampaku settings folders add` (see § Run log, turn 0)
- [x] U2 Public docs sufficient — `npm run build`, `bootstrap`, `serve`, `chat -m`, `projects`, `questions list`
  are all in the root `README`/`.env.example`. **One documented step is not:** granting an allowed folder is only
  discoverable from `kampaku settings folders --help`, and the README never mentions the folder policy at all —
  while that policy is what refused the emperor's own path in turn 0. Recorded as a documented gap in the run log,
  not as an open row: the start path the README gives is sufficient, and the missing line is one command away in
  the CLI's own help
- [x] U3 Clarification visible on chat, CLI, and web — **four surfaces, one record.** Prompt 4's question reached
  the store from the chat reply, `questions list` prints it with its asker, `GET /api/v1/questions` returns the
  same id and text, and the browser renders the same prompt in `#pending-questions-card` and **answers** it
  (`e2e/eval-intent-clarify.spec.ts`, run against this run's own data dir). The web assertion compares the page
  against the server's text, not against a string typed into the test
- [x] U4 Automated tests cited below are green — two authored locks (`eval-intent-clarify.test.ts`,
  `e2e/eval-intent-clarify.spec.ts`) plus the existing `pending-question.test.ts`; `npm test` exits 0
- [x] U5 Fresh data-dir re-run after any fix — the run is one fresh data dir from `bootstrap` to the last prompt.
  No product fix was made during it: the defects found are recorded, not repaired (§ Blocker)
- [ ] **U6 No silent budget failure hiding the oracle — NOT MET.** Prompt 1 ran **911 s** and never returned a
  reply; the intake prompt before it ran **40 minutes**, created nothing, and was still looping when Core was
  stopped. Nothing about either turn reports a budget, and the CLI's only ceiling is a client-side 1800 s timeout
  after which Core keeps working. [F-048](results/BOARD.md)
- [x] U7 Pass criteria stay product-level — the boxes below are the four prompts' outcomes and the state they
  changed, not tool or skill names
- [ ] **U8 No open blocking BOARD row for this suite — NOT MET.** This run opened
  [F-045](results/BOARD.md), [F-046](results/BOARD.md), [F-047](results/BOARD.md),
  [F-048](results/BOARD.md), [F-049](results/BOARD.md) and [F-050](results/BOARD.md), and all six are `open`
- [x] F1 Oracle concerns a software deliverable — the container under test links a real repository (a Python
  order-intake service with a `Makefile`, a test suite and a CI workflow); nothing in the suite's acceptance is a
  document
- [x] F2 Clarification does not assume a stack — the four prompts name no language, package manager or test
  runner, and the replies did not name one either. The fixture is deliberately **non-Node**
- [x] F3 Clarification does not assume a repository shape — the container is a single `file://` checkout whose
  shape the suite never asserts; the product asked what it needed instead of assuming
- [x] F4 No existing convention silently changed — measured, not assumed: 2 projects and 12 seats before prompt 1
  and after prompt 4, the same repository list, and no file written to the fixture
- [x] F5 Shippability path named (not required until suite 23) — not required here; the platform's own path is
  suite 23's

### Suite-specific

- [ ] **Vague intent produced a question or a single proposal, not a flooded board — PARTIAL, and the pass is
  hollow.** The board did not flood: four prompts produced **0 work items**, **0 new containers**, **0 new seats**,
  and the project kept the same one repository. But the clarification was not about what the emperor wants. Prompt 1
  produced four durable questions in fourteen minutes, every one of them about the product's own limitations —
  *"not authorized to create project plans"* (asked twice) and *"how should I explore the repository … I don't have
  a direct file-reading tool available"* (asked twice) — from a lead that cannot read the repository
  ([F-045](results/BOARD.md)) or plan the project it leads ([F-046](results/BOARD.md)), and the turn never returned
  a reply at all ([F-048](results/BOARD.md)). The README's own rule applies: an oracle the product satisfies by
  **not attempting the work** does not count. A clean board caused by an inability to start is not discipline
- [x] No phantom foundation work on a healthy instance — met, and checked against disk. Prompt 3 named the two
  projects, their leads and their work-item counts truthfully, invented no onboarding, no CI and no repository
  setup, and wrote nothing; `readdirSync` on the linked checkout and on the workspace is unchanged (locked in
  `eval-intent-clarify.test.ts` test 3)
- [x] Under-specified request produced concrete named decisions — met, and this is the best behaviour the run
  measured. Prompt 4 answered *"I don't have a record of what 'thing' we discussed"* rather than inventing a
  referent, and then named the decisions it needed: which project, which deliverable, what "mobile" means
  (responsive web, native app, PWA, mobile API, touch targets, offline), and whether it is new work or a change —
  and ended with a durable structured question (`clarify-mobile-target`)
- [x] Zero jobs started — met: `queued 0 · running 0 · zombie 0 · workers online 0` after every prompt, read from
  `GET /api/v1/runtime/status`
- [x] Clarification is durable — met: five pending questions, each readable on `GET /api/v1/questions`,
  `kampaku questions list` and in the browser; the browser answered one and REST moved it to `answered`
- [ ] Prompt 3's answer was false about state — folded into the U6/U8 story rather than ticked. Asked *"What must I
  decide right now?"* with four gates open, the reply said *"No decisions are currently tracked in the factory"*
  and *"I can't locate them in project journals or work items"*, after five tool calls none of which can list
  questions ([F-050](results/BOARD.md))

### In-scope P-gates

- **P3** when the clarification is a durable question — **met.** The question is visible *and answerable* in the
  web UI: `e2e/eval-intent-clarify.spec.ts` opens the instance the run left behind, asserts the page renders the
  prompt the store holds, answers it from the browser, and requires REST to move the same id to `answered`

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-intent-clarify.test.ts` | **Vague intent produces a structured clarify** — the `<kampaku-question>` reply reaches the durable store with its concrete options, is readable over REST and through the CLI's client, is **answerable**, and the turn opens no container, no seat and no work item; **no work-item flood** — a turn naming `update_work_item`/`execute_work_item` does not execute them and the board stays at zero, while the clarify in the same turn is still recorded; **no phantom foundation** — a healthy instance (lead, linked checkout with a CI workflow) gains no container, no seat, no work item and no file | **Authored 2026-09-25 — 3 tests, green** |
| `apps/web/e2e/eval-intent-clarify.spec.ts` | **The web surface, and P3.** Against any core that has asked a question: the page renders the prompt the store holds for the same id, names the asker, and the browser can answer it — after which both statuses agree over REST | **Authored 2026-09-25 — 1 test, green** (driven against this run's data dir) |
| `apps/core/tests/agents/pending-question.test.ts` | A clarification question reaches the durable store: the `<kampaku-question>` contract, the four accepted types, and the prose-only and malformed cases | Exists; re-run and cited (7 tests, green) |
| Suites 01–04's locks, re-run in the same commit window | Incremental regression: every already-green suite's automated tests stayed green | `npm test` **exit 0** — worker 22 files, web 33, core **128 files**; `npm run test:eval` 14 files / **104 tests**; `npx playwright test` **19 passed** (18 for suites 01–04 + 1 new) |

## Pass

- Binary: all oracle bullets hold. **Not met** — see § Result.
- Score: **10** / 10. **Scored 5** — see § Result.

## Run log

### Run 1 — 2026-09-25 (the run that counts)

| Field | Value |
|-------|-------|
| Date | 2026-09-25 |
| Data dir | `/home/pdonoso/.kampaku-eval-01/data` (wiped, `bootstrap`, one instance for the run) |
| Git SHA | `adadf00` + the working tree, landed as the two commits on `develop` named in § Evidence |
| Workspace | `/home/pdonoso/kampaku` (the value `.env.example` documents) |
| Endpoint | FreeLLMAPI `:3001`, model `auto:escalera`; the ladder served `nvidia/nemotron-3-ultra-550b-a55b` for most calls, with groq and cloudflare failovers. **Degraded all afternoon:** OVH returned `429`, cloudflare and nvidia aborted at 60 s and 180 s, per-call latency 100–197 s against 3–10 s in the suite-04 run two days earlier |
| Surfaces | CLI, REST, and the browser (Chromium via Playwright, against this data dir) |
| Wall clock | ~2 h 20 min, of which 55 min was two turns that never returned |
| Tests | `npm test` exit 0 (worker 22 / web 33 / core 128 files); `npm run test:eval` 14 files, 104 tests; playwright 19 passed |
| Fixture | `/tmp/intent-demo` — a Python order-intake service with `Makefile`, `unittest` suite and `.github/workflows/ci.yml`; container `intent-demo`, lead `intent-demo-lead`, one more seat `intent-demo-qa` |

**Turn 0 — the intake, attempted twice, and this is where the run stops being ordinary.**

| Attempt | Prompt | Result |
|---|---|---|
| 1 | `Open a work order for intent-demo. Its repository lives at /tmp/intent-demo. Staff it with the stations this repository actually needs.` | **Refused, correctly and usefully.** The front office delegated to `kampaku-manager`, which answered truthfully: `/tmp/intent-demo` is outside the allowed folders, listed the two that exist, and offered *"add the path to the allowed folders list"* as one of three options. Verified against `kampaku settings folders list` — the claim was exact |
| 1b | The same prompt, after `kampaku settings folders add /tmp/intent-demo` (the product's own suggested remedy, a documented CLI command) | **Ran away.** 40 minutes with a completed model call every 30–120 s, **no reply, no container, no seat, no work item** — the store was identical to its state at turn start. Stopped by restarting Core; the CLI client had already given up at a `408` |

The container and its team were therefore created through documented non-chat surfaces — `POST /api/v1/agents`
twice and `kampaku projects create --lead --repo` — exactly as suite 04's fixtures were. That is the prereq the
suite asks for ("an instance that already has a project and a team"); the intake itself is measured above.

**The four emperor prompts.** Each was driven with `kampaku chat -m`, prompt 2 continued the conversation prompt 1
created, prompts 3 and 4 that same conversation.

| # | Prompt | Tools | Outcome |
|---|--------|-------|---------|
| 1 | `Improve the project. Make it better. Start now.` | *(the reply never returned)* | **0 work items.** Four durable questions against `intent-demo` in 14 min, all from the lead, all about the product's own limits, two of them restatements of the other two ([F-049](results/BOARD.md)). Ran 911 s without returning, then died on `fetch failed` when Core was stopped. No container, no seat, no repository change ([F-048](results/BOARD.md)) |
| 2 | `Clarify first; do not create more than one proposal track until I confirm.` | none | **Created nothing.** Asked which project, which track, and which decision — and truthfully flagged *"there are 4 open questions in the system"*. It also asked which project on a conversation the operator had scoped with `--project-id` ([F-047](results/BOARD.md)) |
| 3 | `What must I decide right now?` | `get_project` ×2, `get_project_journal` ×2, `get_agent_dashboard` | **Invented no foundation** — listed both projects, their leads and their counts truthfully. But **answered a falsehood about state**: *"No decisions are currently tracked in the factory"* while four gates were open, and then asked the emperor for the question ids it could not read ([F-050](results/BOARD.md)) |
| 4 | `Make the thing we discussed work on mobile.` | none | **Held up, and it is the best behaviour measured today.** Declined to invent what "the thing" was, then named the missing decisions concretely — platform (responsive web / native / PWA), surface, and whether the current behaviour changes — and ended with a durable `<kampaku-question>` (`clarify-mobile-target`) |

**State, before and after every prompt** (`~/.kampaku-eval-01/oracle.py`, documented REST only):

| Point | Projects | Seats | Work items | Jobs | Questions |
|-------|----------|-------|------------|------|-----------|
| after `bootstrap` | 1 | 10 | 0 | 0 | 0 |
| after the fixture (restored) | 2 | 12 | 0 | 0 | 0 |
| after prompt 1 | 2 | 12 | 0 | 0 | **4** |
| after prompt 2 | 2 | 12 | 0 | 0 | 4 |
| after prompt 4 | 2 | 12 | 0 | 0 | **5** (then 4, one answered from the browser) |

Nothing was created, restaffed or reshaped by any prompt: the same two containers, the same twelve seats, the same
single repository on `intent-demo`, and not one file written to `/tmp/intent-demo`.

## Result — run 1: binary fail, **5 / 10**

**The oracle does not hold, and the reason matters more than the count.** Two bullets fail on their own terms and
one passes for the wrong reason. Report them separately:

**Holds, on evidence drawn from the world rather than the prose.** The board did not explode: four prompts, zero
work items, zero new containers, zero new seats, zero repositories changed. No jobs started
(`queued 0 · running 0 · zombie 0` after every turn). The clarification is durable and answerable — five questions
visible on `questions list`, `GET /api/v1/questions`, and in the browser, where one was answered and REST moved it
to `answered`. Prompt 4 named the concrete missing decisions instead of asking for "more detail". Prompt 3 invented
no missing foundation. That is the shape the suite asks for, and it is worth saying plainly that the product does
the *mechanical* half of this promise: it asks rather than floods, and the ask survives.

**Fails.** **(a)** "Within the first response cycle …" — for prompt 1 there was no response cycle: 911 s with no
reply and nothing durable except the questions ([F-048](results/BOARD.md)). **(b)** The question a vague
request should produce is *"what do you want?"*. What it produced was a defect report about the product: a lead
that cannot read the repository ([F-045](results/BOARD.md)) and cannot submit a plan for the project it leads
([F-046](results/BOARD.md)), asking the emperor to authorise itself, twice, in four different phrasings
([F-049](results/BOARD.md)).

**And the clean board is not discipline.** The board is empty partly because the line could not start. The README's
rule is explicit — *"a suite whose oracle the product satisfies by not attempting the work … never counts toward
10"* — so the zero-work-item result is recorded as a fact about this run, not as a pass of the anti-flood bullet.

**Score 5/10.** The mechanical promise (ask, do not flood, make the ask durable and answerable) is real and now
locked; the substantive promise (find out what the emperor wants, and be able to act on it) is not met at all.
Two bullets fail, U6 and U8 stand unmet, six BOARD rows are open against this suite, and the run could not
complete its own first prompt. Not `blocked` — the suite ran, and what it measured is the answer.

## Evidence

- **The intake turn that never returned:** 71 lines in the captured proxy window with a completed call every
  30–120 s for 40 minutes (`~/.kampaku-eval-01/s05-intake-runaway-proxy.log`), and the store unchanged at the end.
  The client's own give-up message, verbatim: `CoreClientError: Request to http://127.0.0.1:18080/api/v1/agents/kampaku/chat timed
  out after 1800s … The operation may still be running on Core` (`~/.kampaku-eval-01/s05-intake2.final`)
- **The refusal that was correct:** `/tmp/intent-demo` outside the allowed folders, with the remedy the product
  itself named, matched against `kampaku settings folders list` (`~/.kampaku-eval-01/s05-intake.out`)
- **The four prompts:** `~/.kampaku-eval-01/s05-p1.out` … `s05-p4.out`, verbatim transcripts including
  `mode: llm · model: … · tools: … · conversation: …`
- **The five durable questions, as stored** (`GET /api/v1/questions` and `kampaku questions list`):
  `async-1790359010388` single_choice *"The current agent is not authorized to create project plans for
  intent-demo…"* from `intent-demo-lead`; `async-1790359214514` text *"How should I explore the repository at
  file:///tmp/intent-demo? I don't have a direct file-reading tool available."*; `async-1790359222048` text
  *"Still waiting for guidance on repository exploration approach."*; `async-1790359838567` boolean *"Agent not
  authorized to create project plans…"* — the second asking of the first — and from the front office,
  `clarify-mobile-target`. The `context` field on the authorization questions carries the refused tool's own
  sentence: *"The submit_intent tool returns 'This agent is not authorized to create project plans or subtasks.'"*
- **The capability behind the two repository questions:** `packages/contracts/skills/workflow-filesystem/SKILL.md`
  declares `allowed-tools: list_allowed_folders`, and no read tool appears anywhere in the runtime's tool registry
  (`apps/core/src/agents/runtime/tools/index.ts`); the front office's prompt nonetheless says *"Read the repository
  before naming anyone"* (`apps/core/src/agents/definitions.ts`)
- **The authorization behind the two plan questions:** `apps/core/src/agents/runtime/tools/index.ts` §
  `submit_intent` requires `system-delegation` or `workflow-specialist-delegation`; `GET /api/v1/agents` shows
  `intent-demo-lead`'s thirteen skills and neither is among them, while `kampaku-manager` holds
  `system-delegation`
- **The unscoped conversation:** `GET /api/v1/conversations/<id>` → `projectId: null` for both conversations
  started with `--project-id`; `apps/core/src/cli/agents-output.ts` `sendKampakuMessage` accepts only
  `{ conversationId }`
- **The oracle, before and after each prompt:** `~/.kampaku-eval-01/s05-baseline.json`,
  `s05-01-before.json`, `s05-02-after-p2.json`, `s05-04-after-p4.json` (documented REST only, never SQLite)
- **The locks:** `apps/core/tests/eval/eval-intent-clarify.test.ts` (3 tests),
  `apps/web/e2e/eval-intent-clarify.spec.ts` (1 test), `apps/core/tests/agents/pending-question.test.ts` (8 tests)
- **The regression:** `/tmp/s05-npm-test.log` (exit 0), `/tmp/s05-e2e-regress.log` (18 passed),
  `/tmp/s05-e2e-live.log` (1 passed against the live data dir)
- **Commits:** `4179fc4` *test(eval): lock suite 05's clarify-not-flood promise*, then *docs(eval): run suite
  05, and record the clarification the line cannot reach* (the head of this change — its own sha moves if this
  file is edited again, so it is named by subject rather than by a hash that would be stale on arrival). Both on
  `develop`, nothing pushed. `npm test` re-run on that head: **exit 0** (worker 22 / web 33 / core 128 files)

## Blocker

**Six open rows, none of them a footnote:**
[F-045](results/BOARD.md) (no role can read a repository, and the prompt requires it),
[F-046](results/BOARD.md) (a lead cannot submit a plan for the project it leads),
[F-047](results/BOARD.md) (`chat --project-id` is accepted and never sent),
[F-048](results/BOARD.md) (a turn has no budget and cannot be cancelled),
[F-049](results/BOARD.md) (duplicated questions are not deduplicated),
[F-050](results/BOARD.md) (the front office cannot read its own pending questions).

[BOARD F-001](results/BOARD.md) remains resolved: the container can be created, and this run created one.

### What the next session should take

1. **F-045 and F-046 are the two that decide this suite.** Both are authority-and-capability gaps of the kind
   ADR-0006 and F-021 already closed once, one layer out: the role that must read the repository has no read
   tool, and the role that must plan the project is not authorized to. Until a lead can read and plan, every
   vague prompt on a healthy instance will produce this run's questions instead of the emperor's.
2. **F-048 before re-running anything live.** A 40-minute turn that changes nothing is not a measurement, and
   the next suite that needs a real turn (06, 07, 08) will pay it again. A turn-level iteration and wall-clock
   budget, reported as it is spent, is the cheapest fix in this list.
3. **Re-run this suite on a fresh data dir once F-045/F-046 are closed.** The four prompts are cheap when the
   line can act; prompt 1's reply is the box that needs re-measuring, and the lock is already in place for it.
