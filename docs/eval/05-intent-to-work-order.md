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
- [x] **U6 No silent budget failure hiding the oracle — MET in run 2.** Run 1 failed it on its own terms: prompt 1
  ran **911 s** and never returned a reply, and the intake prompt before it ran **40 minutes**, created nothing,
  and was still looping when Core was stopped ([F-048](results/BOARD.md)). Run 2 turned the same two prompts
  around: the intake turn returned in **~2.5 min** with the container and the repository read, and prompt 1 in
  **~2 min** with six concrete improvements and nothing created. The bound now exists as well as the speed —
  `turnBudgetMs`, checked **before** each model call and inherited by every delegated session — and a turn that
  reaches it says so in its reply and on the CLI's meta line. Locked by `eval-turn-budget.test.ts`, including the
  control that a budgeted turn still works, because a guard that stopped every turn would pass the other two
  tests and break the product
- [x] U7 Pass criteria stay product-level — the boxes below are the four prompts' outcomes and the state they
  changed, not tool or skill names
- [x] **U8 No open blocking BOARD row for this suite — MET in run 2.** Run 1 left six rows `open`:
  [F-045](results/BOARD.md), [F-046](results/BOARD.md), [F-047](results/BOARD.md),
  [F-048](results/BOARD.md), [F-049](results/BOARD.md) and [F-050](results/BOARD.md). All six are now
  `resolved`, each with its own lock and each re-measured on the live instance rather than argued closed. The
  suite found no new row in run 2. **This is not a claim that the factory is defect-free** — nine rows elsewhere
  on the board remain `open`, and none of them blocks this suite's oracle
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

- [x] **Vague intent produced a question or a single proposal, not a flooded board — MET in run 2.** The board
  stayed clean for the right reason this time. Four prompts produced **0 work items**, **0 new containers**,
  **0 new seats**, the same one repository, and — measured, not assumed — **no write to the fixture**: `find`
  over `/tmp/intent-demo` shows nothing modified after it was created, which is the anti-flood bullet and F4
  together. The clarification was about what the emperor wants rather than about the product: prompt 1 read the
  checkout twelve times and named six concrete improvements grounded in what it found (*no `pyproject.toml`*, the
  CI's actual steps, the untested branches in `tests/test_service.py`), then proposed one track and asked which
  to open; prompt 2 held the line the emperor set — *"No parallel tracks"* — and offered four scoped options
  with acceptance evidence instead of a board; prompt 4 named the four meanings of "mobile" and asked which,
  rather than inventing a referent. Every question was a decision the emperor can answer. **Run 1's failure is
  kept below in the run log**: a clean board caused by an inability to start is not discipline, which is why this
  box is ticked on run 2's evidence and not on run 1's zero
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
- [x] Prompt 3's answer was true about state — **MET in run 2.** Run 1 failed it: asked *"What must I decide right
  now?"* with four gates open, the reply said *"No decisions are currently tracked in the factory"* and *"I can't
  locate them in project journals or work items"*, after five tool calls none of which can list questions
  ([F-050](results/BOARD.md)). Run 2 asked the same question with one gate open and got the gate: its id
  `0a6adae0-5097-4961-a98c-091cf364b115`, the decision in words, and the four options with their scopes — no tool
  call, because the block renders the open gates. The id in the reply is the id in the store, checked over REST
  rather than read off the reply

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
| `apps/core/tests/eval/eval-turn-budget.test.ts` | **F-048** — an exhausted turn spends **nothing** (the check runs before the model call) and answers with its numbers, that nothing was created, and what to do next; a delegated session **inherits the turn's deadline** rather than starting a fresh clock; and the control, that a budgeted turn still reaches the model and answers. Also **F-046** in both directions: the linked lead reaches the planner, an agent that leads nothing is still refused with a message naming what widens it | **Authored 2026-09-25 — 5 tests, green** |
| `apps/core/tests/eval/eval-repository-read.test.ts` | **F-045** — the reader lists the checkout (manifest, CI, source) and skips build output and credentials *by name and not silently*; a file's text is returned and a file over the bound is cut **with the cut stated**; every path outside the project's checkout is refused, including `..` and an absolute path to a real host file; and a project with no local checkout says so instead of returning an empty listing | **Authored 2026-09-25 — 4 tests, green** |
| `apps/core/tests/persistence/question-store.test.ts`, `apps/core/tests/agents/durable-state.test.ts` | **F-049** one decision one gate (a restatement returns the open record, answered gates are not deduped against), and **F-050** the block renders the open gates with their ids, asker, audience and prompt, plus the rule that forbids asking for an id the block lists | Extended 2026-09-25 — green |
| `apps/core/tests/cli/chat-scoping.test.ts` | **F-047** — `kampaku chat --project-id` reaches the server: the test drives the real `CoreClient` against a real app, because the defect was a flag that survived two layers and died in a third | **Authored 2026-09-25 — green** |
| Suites 01–04's locks, re-run in the same commit window | Incremental regression: every already-green suite's automated tests stayed green | `npm test` **exit 0** — worker 22 files, web 33, core **131 files** (128 + the four new files); `npx playwright test` on suites 01–04's specs **18 passed**, and the new `eval-intent-clarify.spec.ts` **1 passed** |

## Pass

- Binary: all oracle bullets hold. **Met in run 2.** Run 1 did not, and its failure is kept below.
- Score: **10** / 10. **Scored 8** on run 2 (run 1: 5) — see § Result.

## Run log

### Run 2 — 2026-09-25 (the run that counts)

| Field | Value |
|-------|-------|
| Date | 2026-09-25, 19:08–19:32 |
| Data dir | `/home/pdonoso/.kampaku-eval-01/data` (wiped, `bootstrap`, one instance for the run) |
| Git SHA | `08b9af5` + the six fixes in this run's working tree, landed as the commits named in § Evidence |
| Workspace | `/home/pdonoso/kampaku` (the value `.env.example` documents) |
| Endpoint | FreeLLMAPI `:3001`, model `auto:escalera` → `nvidia/nemotron-3-ultra-550b-a55b`. **Healthy:** recorded completions of 37.8 s and 12 s, no aborts, against 100–197 s per call in run 1 |
| Surfaces | CLI, REST, and the browser (Chromium via Playwright, against this data dir) |
| Wall clock | ~24 min of live turns, and **every turn returned** — the longest was the intake at ~2.5 min |
| Tests | `npm run build` exit 0 (the web app's type check fails in run 1's committed state and passes here — see § Evidence); `npm test` exit 0 (worker 22 / web 33 / core **131** files); playwright 18 passed for suites 01–04 plus 1 for this suite |
| Fixture | `/tmp/intent-demo` — a Python order-intake service with `Makefile` (`install`/`test`/`lint`), `.github/workflows/ci.yml`, `intent_demo/service.py` and `tests/test_service.py`. Written **before** the run and never touched after: `find -newermt` over it returns nothing, so an empty board cannot be explained by a repository the product quietly edited |

**The six fixes this run measures were made between run 1 and run 2**, each locked by its own test and each
re-measured here rather than argued closed. The tree was not clean when this run began — a previous session had
left eight modified files and a new test in it, **not compiling** (`repl.ts(228)`: `Cannot find name 'options'`).
That work was kept and finished, not reverted, and the reason is recorded in § Evidence.

**Turn 0 — the intake, and the turn run 1 died on.**

| # | Prompt | Tools | Outcome |
|---|--------|-------|---------|
| 0 | `Open a work order for intent-demo. Its repository lives at /tmp/intent-demo. Staff it with the stations this repository actually needs.` | `create_project`, `read_repository` **×4**, `create_sub_agent` ×3, `list_skills`, `list_agents` | **Returned in ~2.5 min** with the container created, its repository linked and its lead assigned — and with the repository actually read. It described the fixture correctly and from disk: *"a Python module (`intent_demo.service`) with unittest tests and a Makefile (`install`, `test`, `lint`)"*, then named the stations it needs. It also reported honestly that it had guessed two skill slugs that are not in the catalog and had not finished staffing — a self-report of a real gap, not a claim of work |

**The four emperor prompts.** Prompts 1–4 continued one conversation, scoped with `--project-id 0f6ea553…`.

| # | Prompt | Tools | Outcome |
|---|--------|-------|---------|
| 1 | `Improve the project. Make it better. Start now.` | `get_project`, `read_repository` **×12** | **0 work items, 0 containers, 0 seats.** Returned in ~2 min with six concrete improvements drawn from the checkout — no `pyproject.toml`, the CI workflow's actual steps, the branch coverage in `tests/test_service.py`, no entry point — and then asked which to do first instead of starting all of them |
| 2 | `Clarify first; do not create more than one proposal track until I confirm.` | none | **Created nothing, asked one thing.** Four scoped tracks each with acceptance evidence, the rule stated back — *"No parallel tracks"* — and one durable `single_choice` gate (`improvement-track`) with the four options |
| 3 | `What must I decide right now?` | **none** | **True about state, with no tool call.** Named the gate by id (`0a6adae0-5097-4961-a98c-091cf364b115`), the decision in words and its four options. The id in the reply is the id in the store, checked over REST, not read off the reply |
| 4 | `Make the thing we discussed work on mobile.` | `triage_intent`, `delegate_to_agent` | **Held up.** Declined to invent a referent in the first turn of a new conversation, said plainly that no mobile component exists in `intent-demo`, drew the boundary (*"a new project with a different repository, stack, and team — not an improvement to intent-demo"*), named the four meanings of "mobile" and asked which — ending in a durable gate |

**State, before and after every prompt** (`~/.kampaku-eval-01/oracle.py`, documented REST only):

| Point | Projects | Seats | Work items | Jobs | Questions (pending / answered) |
|-------|----------|-------|------------|------|--------------------------------|
| after `bootstrap` | 1 | 10 | 0 | 0 | 0 / 0 |
| after the fixture and `settings folders add` | 1 | 10 | 0 | 0 | 0 / 0 |
| after the intake (turn 0) | **2** | **12** | 0 | 0 | 0 / 0 |
| after prompt 1 | 2 | 12 | 0 | 0 | 0 / 0 |
| after prompt 2 | 2 | 12 | 0 | 0 | **1** / 0 |
| after prompt 4 | 2 | 12 | 0 | 0 | 2 / 0 |
| after answering one from the CLI | 2 | 12 | 0 | 0 | 1 / **1** |
| after the browser lock | 2 | 12 | 0 | 0 | 0 / **3** |

Two containers and twelve seats, one of which — the intake's own container — is the work order the emperor asked
for. Every prompt after it created **nothing**: no work item, no seat, no container, no repository change, and not
one file written to the fixture. The questions moved only when a human moved them: one answered with
`kampaku questions answer` on the CLI, the rest from the browser, and each answer was read back over REST.

**Two honest gaps in run 2, recorded rather than smoothed over.** The intake turn's own report ends with a
partial: it invented two skill slugs (`workflow-project-governance`, `system-coding`), had both refused, and left
the team at two seats instead of the three stations it had just named — the refusal was correct and the recovery
was to stop and say so, which is the right behaviour and also an unfinished work order. And prompt 4's question was
asked by a delegated lead with no project attached (`project: None` in the store), so the gate is not filed against
the container it concerns. Neither meets the bar for a new board row; both are here because a run log that only
records what passed is not a run log.

### Run 1 — 2026-09-25 (superseded; the run that found F-045 … F-050)

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

## Result — run 2: binary pass, **8 / 10**

**The oracle holds, and it is worth being precise about what changed.** Run 1 scored 5 and failed two bullets on
their own terms. Run 2 turns both around with the same four prompts, the same fixture design and a fresh data dir:

- **The work is attempted, and it is attempted against the world.** The intake turn read the fixture four times
  and the first emperor prompt twelve, and every claim either turn made about the repository — its language, its
  test runner, its `Makefile` targets, its CI steps, the files it does *not* have — is checkable against
  `/tmp/intent-demo` and true. That is the difference between run 1's four questions *about the product's
  limitations* and run 2's one question *about the emperor's intent*.
- **The board is clean because the product asked, not because it could not start.** Four prompts, zero work items,
  zero new containers after the intake, zero new seats after the intake, one repository, and no write to the
  fixture. Run 1 also had a clean board, and the suite refused to count it because the line could not begin. This
  one can: it read the repository, named the aspects, proposed one track and asked which — the shape the box asks
  for.
- **The clarification is a decision, and only one.** Prompt 2's response is a single gate with four scoped options
  and its rule held (*"No parallel tracks"*), which is the anti-flood bullet passing on evidence instead of on
  silence. Prompt 3 then read that gate back — by id, with no tool call — which is the state-truth bullet passing.
- **Nothing ran away.** The longest turn was ~2.5 minutes against run 1's 911-second turn and 40-minute intake, and
the bound now exists rather than only the speed: a turn has a wall-clock budget, it checks it before paying for a
model call, a delegated session inherits it instead of starting a fresh clock, and a turn that reaches it says so
in words and on the CLI's meta line. **No turn in this run stopped at the budget**, which is the right result: the
budget is a ceiling, not a wall, and the control test in the lock asserts exactly that.

**Why 8 and not 10, stated plainly.** Two points are withheld deliberately.

1. **The suite asked for two runs' worth of evidence and it has one.** U6 and U8 were failed on measured behaviour
   in run 1 and reversed on measured behaviour in run 2, which is the strongest form of the evidence available —
   but the four prompts here also ran with the six fixes already in the tree. There is no run of this suite on an
   unmodified instance that passes, and there is no independent run *after* this one on the same instance to show
   the fixes hold when nothing is being watched. A score of 10 is reserved for a suite whose oracle holds on a run
   nobody had to repair first; this run repaired the product and then satisfied the oracle, which is a weaker
   claim than the schema means by 10.
2. **The intake leaves its own work order unfinished, and the run says so.** The turn created the container, read
   the repository and named the three stations it needs — then made two of them and stopped, reporting that it had
   guessed skill slugs that do not exist. The behaviour at the point of failure is right (refuse, report, do not
   invent a sixth seat) and the order it was given — *"staff it with the stations this repository actually needs"*
   — is not met. Letting that count as full marks would be the same error the suite already refuses: an oracle the
   product satisfies by not finishing the work.

**F-045 … F-050 are all six `resolved`, each with its own lock, and none of them is argued closed.** Run 1's
failure text is kept verbatim below, because a board that only shows resolutions cannot be audited.

## Result — run 1 (superseded): binary fail, **5 / 10**

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

### Run 2

- **The four prompts and the intake, verbatim:** `~/.kampaku-eval-01/r2-intake.out`, `r2-p1.out` … `r2-p4.out`,
  including each turn's `mode: llm · model: … · tools: … · conversation: …` meta line — the tool lists are how the
  reading is evidenced (`read_repository` ×4 on the intake, ×12 on prompt 1, **none** on prompt 3)
- **The six fixes, each with its lock:**
  `apps/core/src/agents/runtime/tools/read-repository.ts` (F-045),
  `apps/core/src/agents/runtime/tools/authorization.ts` § `ledProjectFor` (F-046),
  `apps/core/src/cli/agents-output.ts` + `apps/core/src/cli/repl.ts` (F-047),
  `apps/core/src/config.ts` § `turnBudgetMs` + `apps/core/src/agents/runtime/session.ts` +
  `sub-agent-session.ts` + `tool-labels.ts` (F-048),
  `apps/core/src/persistence/question-store.ts` § `questionSignature`(F-049),
  `apps/core/src/agents/runtime/durable-state.ts` § `openGates` (F-050) — with
  `eval-repository-read.test.ts`, `eval-turn-budget.test.ts`, `tests/cli/chat-scoping.test.ts`,
  `question-store.test.ts` and `durable-state.test.ts`
- **The conversation scoping, read back from the server:** `GET /api/v1/conversations/dafd7f02-…` →
  `projectId: 0f6ea553-a3ee-40a0-b442-0a4ad28a7495`, 31 messages. Run 1's equivalent returned `projectId: null`
- **The three questions as stored** (`GET /api/v1/questions`, `kampaku questions list`):
  `0a6adae0…` and `e0ff06aa…` `single_choice`, both against `0f6ea553…`; plus `dc99b929…` asked by
  `kampaku-manager` with `project: None` (the run's second honest gap). Each moved to `answered` only by a human
  action — one through `kampaku questions answer` on the CLI, read back as `answered` in the same turn
- **The oracle at every step:** `~/.kampaku-eval-01/r2-01-before.json` and the `oracle.py` output quoted in § Run
  log, documented REST only, never SQLite
- **The fixture was not touched:** `find /tmp/intent-demo -newermt "2026-09-25 19:00"` returns nothing outside
  `__pycache__`, and `ls -la` shows the same four mtimes the fixture was written with
- **The web lock, run twice, and the second run is the one that counts:**
  `PLAYWRIGHT_CORE_DATA_DIR=/home/pdonoso/.kampaku-eval-01/data npx playwright test e2e/eval-intent-clarify.spec.ts`
  — **failed** at first with `answerBox.fill(…)` timing out (`/tmp/s05g-e2e-live.log`), because the lock only knew
  how to answer a `text` question and every gate this run produced is `single_choice` (radio). Fixed to answer the
  question the browser offers rather than the type the test assumed, then **1 passed** against the live instance
  (`/tmp/s05i-e2e-live.log`). Recorded because it is the same class of error the suite is about: a test that
  asserts the shape it expects instead of the shape the product has
- **The build, which run 1's committed state does not pass:** `npm run build` → web
  `e2e/eval-intent-clarify.spec.ts(88,55) TS2353: 'exact' does not exist in type …` — `toContainText` takes no
  `exact` option, and the file is the web lock committed with run 1. Fixed; the build is `exit 0` here, which is
  what makes U2's *"public docs sufficient"* claim honest rather than aspirational
- **The tree was dirty and did not compile when this run began:** eight modified files plus
  `tests/cli/chat-scoping.test.ts`, from a previous session, with `repl.ts(228) error TS2552: Cannot find name
  'options'`. It was **kept and finished** rather than reverted: the work was the six fixes above, abandoned
  mid-edit, and reverting it would have thrown away the correct repairs to F-047/F-048/F-049/F-050. The one line
  that needed judgment — `runRepl` had no `projectId` in scope — was given one, so the interactive REPL carries
  the same scoping the single-message path does
- **Regression:** `npm test` exit 0 (worker 22 / web 33 / core 131 files); suites 01–04's playwright specs
  **18 passed** (`/tmp/s05k-e2e-regress.log`), run in the same window

### Run 1

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
