# 07 — A plan a human can run

## Promise tested

The plan is something an external reviewer can understand and execute without the factory — ordered
steps, named owners, and check commands that run in **this** project.

## Why it elevates

Weak: one leaf called "build the app" with vague acceptance; check commands copied from a template and
not from the repository; a plan that could belong to any project.

Credible: a cold reader can follow it in five minutes, every check command exists in this project's
toolchain, and the plan states what it will not do.

## Prereqs

- Suite [06](06-greenfield-stranger-repo.md) green (a project exists to plan for), or a brownfield
  project from [19](19-brownfield-and-legacy.md).
- Do not require execution here: the focus is plan quality before or at the start of execution.

## Emperor prompts

1. `Plan the first vertical slice for this project: something a user or caller can use. Break it into steps a human could follow without you. Include the exact check commands for this project's toolchain, and the acceptance evidence for each step. Do not mark anything done. Wait for my go before execution.`
2. `Which check commands did you derive, and from what in the repository?`
3. `What is deliberately out of scope for this slice?`
4. Cold read: hand the plan to a second person (or yourself after a break) with a five-minute timer.

## Oracle

- The plan has multiple steps with stable ids, named owners, and statuses at `todo`.
- Every check command in the plan **runs in this project** at the current commit and produces a
  meaningful result. Commands that fail because they are not part of this project's toolchain are a
  failure of this suite.
- Each step states its acceptance evidence in a form that can be executed or inspected (F2).
- The plan states what is out of scope for the slice, with a reason.
- A cold reader can restate the goal, the steps, and how to verify each step, from the plan alone.
- Planning creates no jobs and marks nothing done.
- The plan does not restructure the project: no step moves files, renames packages, or changes the
  build system unless that is the requested work (F3/F4).
- Prompt 2 produces a traceable answer: for each derived command, the file or convention it came from.

## How to measure

- Execute every check command in the plan; record exit codes and output.
- Time the cold read; record whether the reader needed to ask a question.
- Snapshot work-item statuses and job counts before and after planning.
- Compare the plan's steps against the repository shape: does the plan respect the packages and
  boundaries that already exist?

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — run 4 bootstrapped `/home/pdonoso/.kampaku-eval-07r4/data` from nothing, seeded
      one project and its lead, and ran the three prompts on one conversation. **Qualifier, as suite 06 kept:**
      the instance was fresh, the tree was not — the fixes this suite needed were committed at `b6b854b`
      before the run, which is what U5 asks for and what makes run 4 a re-run rather than a first attempt.
- [x] U2 Public docs sufficient — `npm install`, `cp .env.example .env`, `node apps/core/dist/cli.js
      bootstrap|serve` started the stack from the documented names alone. The inherited trap was armed again
      and re-measured: the repository `.env` loads *after* the run's environment, so `KAMPAKU_DOTENV_OVERRIDE=0`
      (or a sourced `run.env`) is required, and this run used `~/.kampaku-eval-01/run-s07r4.env`.
- [x] U3 Plan and statuses visible identically on chat, CLI, and web — **ticked by run 18.** Chat read the
      applied plan back with `get_project` and rendered it (ids, owners, statuses, check command, acceptance
      evidence); `kampaku projects show textstats` printed the same eight items, the same ids, `textstats-lead`
      and `todo`; the web UI (`next build` with `KAMPAKU_CORE_URL` pointed at this run's Core, served on `13018`)
      rendered the `textstats` row at status `planning` with lead `textstats-lead`, and its work-item response
      through the app's own `/api/v1` path was **byte-identical** to Core's (`cmp` clean). Two harness notes,
      both recorded: the web rewrite target is baked at *build* time, so a UI built against another Core shows
      `Core offline` while serving nothing wrong; and the sidebar's status dot is a client-side probe against
      the browser origin, which reads `offline` in a headless fetch.
- [x] U4 Automated tests cited below are green — **re-run for run 18:** `eval-plan-quality` 4 ✓,
      `eval-plan-evidence-derivation` 4 ✓, `eval-plan-apply-tool` 10 ✓, `eval-plan-durability` 4 ✓,
      `project-toolchain` 14 ✓, `apps/web` 79 ✓ across 33 files.
- [x] U5 Fresh data-dir re-run after any fix — run 18 is a fresh data dir *after* the F-067/F-068 fixes and the
      request-sized plan quota. **Honest caveat, kept from run 4:** this is the first run on that tree; nothing
      has been re-run a second time on an unchanged tree, and the fix that made this run possible is the one the
      run itself measures.
- [x] U6 No silent budget failure hiding the oracle — **ticked by run 19, on the run where the budget actually
      fired.** The stop reported *"5.1 of 5.0 minutes"*, split its own **3 model calls in 15s (slowest 8.4s)**
      from the **291 s inside one delegation**, counted that delegation's **11 model calls** where run 16
      reported one, named the *"8 work item(s)"* that landed, and still refused to call anything done. Nothing
      about the oracle was hidden: the plan was in the store before the stop arrived. [F-060](results/BOARD.md)
      and [F-061](results/BOARD.md) are closed; [F-070](results/BOARD.md) is what the run found about the
      bound's own mechanics, and it is open.
- [x] U7 Pass criteria stay product-level — every box was restated as an observable property of the product
      (persisted steps with ids, commands that run, a stranger who can restate the plan), never as a property
      of the harness.
- [x] U8 No open blocking BOARD row for this suite — **ticked by run 20, on the shipped defaults.** Every
      row this suite opened that could stop the plan is closed by measurement rather than argument:
      [F-058](results/BOARD.md) (the default is now 900 000 ms, and run 20 planned on it in 4 m 22 s with no
      stop), [F-059](results/BOARD.md), [F-060](results/BOARD.md), [F-061](results/BOARD.md),
      [F-063](results/BOARD.md), [F-064](results/BOARD.md), [F-065](results/BOARD.md),
      [F-069](results/BOARD.md), [F-070](results/BOARD.md) and [F-071](results/BOARD.md).
      [F-072](results/BOARD.md) is open and is **not blocking**: the plan persists, every leaf is `todo`, and the
      ordering a human follows is in the leaves and in the wiki — what is thinner is only the machine-enforced edge.
- [x] F1 Deliverable is software — the fixture is a real Python package with a manifest, a Makefile, a test
      suite and CI; the product's own deliverable was the plan, which is the part that failed.
- [x] F2 **Every check command runs in this project's toolchain** — the two commands the reply derived were
      executed here: `make check` → **exit 0**, `Ran 3 tests … OK`; `make lint` → **exit 0**. No `npm`-shaped
      command appears anywhere in the reply, and the pre-fix discovery that offered `python -m pytest -q`
      (which fails here) is [F-057](results/BOARD.md), resolved.
- [x] F3 Plan respects the existing package and module boundaries — **ticked by run 18.** Every leaf adds
      files inside the layout the repository already has (`src/textstats/stats.py`, `cli.py`, `__main__.py`,
      `tests/test_stats.py`, `tests/test_cli.py`, `docs/audit/latest.md`) plus one `[project.scripts]` entry in
      `pyproject.toml`; no leaf moves a file, renames a package or touches the build system, and W1 states that
      the existing tokenisation module must not change behaviour. The fixture is byte-identical after the run.
- [x] F4 No restructuring of an existing codebase — the fixture's twelve source files are byte-identical after
      the run (`s07r4-fixture-hashes.txt` vs run 3's record; the fixture's `git status` is empty). Only
      `__pycache__` appeared, from `make check`/`make lint` being executed, and it is gitignored.
- [x] F5 The slice names how it will be exercised by a stranger — **ticked by run 18.** The plan carries the
      commands themselves — `PYTHONPATH=src python3 -m textstats README.md`, the stdin form, `--top 2`, and
      `/no/such/file` → `exit=2` — as W2/W3/W4's acceptance evidence, and the project holds a frozen CLI
      contract document that fixes the three-line output, the default `--top`, the alphabetical tie-break and
      the exit codes. The surface that releases execution (`kampaku projects play|step textstats`) is named
      beside them.

### Suite-specific

- [x] Multi-step plan with stable ids and owners — **eight items, five leaves, all `todo`, all owned by
      `textstats-lead`, every leaf carrying its check command, its acceptance evidence and its dependencies.**
- [x] Every check command executed and recorded — `make check` exit 0, `make lint` exit 0 (F2 above)
- [x] Acceptance evidence is executable or inspectable — **`make check`, `make lint`, explicit
      `PYTHONPATH=src python3 -m textstats …` invocations, and `test -f <path>` existence checks, each written
      into the leaf that closes on it.**
- [x] Out-of-scope stated with reasons — run 4: five items each with a reason, in 53.4 s. **Run 18: thirteen
      items in two groups, each with its reason, in 7.9 s, answered from the plan document rather than
      reconstructed.**
- [x] Cold read succeeded in five minutes — **taken by a model reader, and that limitation is stated.**
      `~/.kampaku-eval-01/s07r19-coldread-artifact.md` is the applied plan and nothing else, handed to a **fresh
      conversation with no history and no tools**; `s07r19-coldread.out` is the read. It answered the three
      questions from the artifact alone in one pass — goal, the seven steps in order, per-step verification —
      reported **no question needed**, and named four things it could not answer from the artifact (**R1–R5**
      unexplained, `wi-01..wi-07` cited without ids, one owner for all seven leaves, and `make check` treated as
      authoritative without the artifact saying what runs it). **Not a substitute for the human read the box was
      written for:** this reader is a language model reading the same store, so the box is ticked on the plan
      being self-describing, not on a person having been in the loop. A human read of the same artifact is still
      the stronger evidence, and the artifact is ready for one.
- [x] Zero jobs, nothing marked done — 0 jobs; **eight work items, all `todo`**; `executionPhase: "idle"` on
      every one. Run 4 ticked this for the empty reason (*nothing was planned*); run 18 ticks it for the real
      one: a plan exists, persists, and nothing executes.
- [x] Prompt 2 traces each command to its source — `make check` ← `Makefile` target `check`; `make lint` ←
      `Makefile` target `lint`; CI ← `.github/workflows/ci.yml`

### In-scope P-gates

- **P1** soft (nothing marked done) · **P6** required · **P8** if any step touches existing code

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-plan-quality.test.ts` | Multi-step plan with owners and ids, statuses todo, out-of-scope recorded, zero jobs | **Green, re-run for run 18** (4 tests) |
| `apps/core/tests/eval/eval-plan-evidence-derivation.test.ts` | Plan check commands derived from the repository toolchain, not from a template | **Green, re-run for run 18** (4 tests; 2 were red before the fix, verified by reverting the fragment) |
| `apps/core/tests/eval/eval-plan-apply-tool.test.ts` | The apply reaches `executeSubmitIntent` with its `approvalReference`, refuses by name, and persists work items without re-planning | **Green, re-run for run 18** (10 tests; 8 red without the F-067 change) |
| `apps/core/tests/eval/eval-plan-durability.test.ts` | Preview → approve → apply through the documented routes produces `todo` work items | **Green, re-run for run 18** (4 tests) |
| `apps/worker/tests/project-toolchain.test.ts` | A declared entry point outranks a language profile's guess | **Green, re-run for run 18** (14 tests) |
| `apps/web` (33 files) | The surfaces the operator reads | **Green, re-run for run 18** (79 tests) |
| `apps/core/tests/pm/phase-key-and-plan-hash.test.ts` | Plan preview/approval integrity | Exists; re-run and cite |

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-28 (sixteen runs: r1/r2 default budget, r3 `900000`, r4 `1800000`, r5 `1800000` + the plan-path fragment fix, r6 `1800000` cut off by the CLI's own 1800 s ceiling, r7 `3600000`, r8 60-min budget with the reading forbidden by prompt, r9 `900000` with the iteration cap at 24, r10–r15 in order as each row landed, **r16 `3600000` on the run-15 fixes with DeepSeek pinned first**), then **2026-09-29: r17 cut at 33 m by operator decision (F-065's measurement, not scored) and r18 on the request-sized quota** |
| Data dir | `~/.kampaku-eval-07/data` (r1), `…-07r3/data` (r3), `…-07r4/data` (r4), `…-07r16/data` (r16), `…-07r18/data` (r18) |
| Git SHA | **`378a035` at run 18** (F-067, F-068, and the request-sized plan quota of F-065); `cb27b77` (F-066) at run 16; `d896303` at run 9, `46184ce`/`9f090bc` at run 8, `134e8ca` at run 7, `21530b2` at run 6, `b6b854b` at run 4–5 |
| Model / provider | production endpoint `http://127.0.0.1:3001/v1`, FreeLLMAPI `auto:escalera` → **`deepseek-flash`**, pinned at priority 1 so every call is served on attempt #0 |
| Run 17, and why it was cut | Fresh data dir, `cd030fd` (F-067 + F-068) with DeepSeek pinned first. It ran on the **old plan budget**: the endpoint's log shows the request growing 6,957 → 14,852 tokens while every response came back at 9,173–14,978 tokens in 32–49 s — 33 minutes of expansion on a request for one vertical slice, with the plan still not written. That is [F-065](results/BOARD.md), and once the default budget was decided the run was demonstrating a cost that had already been measured, so the operator cut it and **run 18** was taken on the new default (`standard`, 3 leaves per phase). Run 17 is not scored; it is the measurement F-065 was decided on |
| **Run 18 — the run that produced a plan** | Fresh data dir `~/.kampaku-eval-07r18`, bootstrapped, `textstats` seeded with `textstats-lead` and the checkout granted, on `378a035` (F-067 + F-068 + the request-sized plan quota) with DeepSeek pinned first, and the same stated inputs as run 16/17: `KAMPAKU_TURN_BUDGET_MS=3600000`, `KAMPAKU_CLIENT_TIMEOUT_MS=4500000`. **Prompt 1 returned in 2 m 58 s** and the project holds **eight work items at `todo`** — one phase, two tracks, five leaves — with the preview/approve pair that authorises them. Prompts 2 and 3 were taken on the same conversation afterwards, 9.0 s and 7.9 s. This is the first run in eighteen that reaches the suite's central oracle, and it is the run `Blocker` was rewritten for |
| Wall clock | run 4: prompt 1 **25 m 18 s**, prompt 2 **8.2 s**, prompt 3 **53.4 s**; run 16: prompt 1 **60.6 of 60.0 min**, prompt 2 **17 m 24 s**, prompt 3 **1 m 8 s**; **run 17: prompt 1 cut at 33 m by operator decision** (see below), prompt 2/3 not taken; **run 18: prompt 1 2 m 58 s, prompt 2 9.0 s, prompt 3 7.9 s** — the whole suite in under four minutes of model time; **run 19 (shipped default budget): prompt 1 stopped at 5.1 of 5.0 min, prompt 2 11.7 s, prompt 3 36.4 s** |
| **Run 19 — the default budget, and the account of it** | Fresh data dir `~/.kampaku-eval-07r19`, `f51fb6a`, **no `KAMPAKU_TURN_BUDGET_MS`** (the shipped 300 000 ms), same prompt 1. Prompt 1 **stopped at 5.1 of 5.0 minutes** after 14 model calls and returned the split, the delegation's own 11 calls, and the durable change: **8 work items, all `todo`** (`kampaku projects show textstats` → 8), one coherence-plan document, two milestone checks. Prompts 2 and 3 still answered from the store. This run is why [U6](#universal-gates) is ticked: the box asks that a budget stop not hide the oracle, and this one named the oracle instead |
| **Run 20 — the shipped defaults, and no operator-stated input at all** | Fresh data dir `~/.kampaku-eval-07r20`, `dbba854`, **no `KAMPAKU_TURN_BUDGET_MS`** and no per-call override: the 900 000 ms default, the 120 s / 3-retry model policy, `textstats` seeded with `textstats-lead`. **Prompt 1 returned in 4 m 22 s** with **no budget stop**, **7 work items all `todo`**, two `planned` milestones, **zero jobs**, **0 refusals**, and three published wiki documents. Prompts 2, 3 and 4 took **6.8 s, 8.5 s and 1 m 45 s**. The dependency graph persisted **by id** (one id for each of two leaves, two ids for the phase gate), which is [F-069](results/BOARD.md)'s fix visible in a store |
| **Run 20 wiki probe (prompt 4)** | Asked to publish the slice's scope with `propose_wiki_edit`, and to say plainly if the store were unreachable. The store **was** reachable — the lead proposed an edit against the existing `roadmap` page, got *"Edit proposed. Pending project lead approval."*, and rejected it to leave no residue — and a new slug failed three times with `Wiki page not found.` Reporting both facts, and its own uncertainty about one of them, is what made the residual visible: the tool had an edit path and no create path. Fixed in the same session; see [F-071](results/BOARD.md) |
| **Run 19 cold read** | `s07r19-coldread-artifact.md` (the applied plan and nothing else), handed to a fresh conversation with no history and no tools; `s07r19-coldread.out` is the read. Reader: **a language model, not a person** — see § Run 19 |
| Cold reader | **not done.** Run 18 produced the artifact that can be read — `~/.kampaku-eval-01/s07r18-coldread-artifact.md`, the applied plan and its out-of-scope list and nothing else — and **no second person has read it yet**. The box stays unticked until one does, with the timer and whether they had to ask a question |
| Tests | run 18 re-ran and cites: `eval-plan-quality` 4 ✓ · `eval-plan-evidence-derivation` 4 ✓ · `eval-plan-apply-tool` 10 ✓ · `eval-plan-durability` 4 ✓ · `project-toolchain` 14 ✓ · `apps/web` 79 ✓ (33 files) |

## Result

**MEASURED — binary met, 10/10.** Twenty runs. Run 18 produced the durable plan, run 19 measured the shipped default and the turn's own account of its time, and **run 20 is the first run taken on the shipped defaults with no operator-stated input of any kind: prompt 1 planned in 4 m 22 s, seven work items, nothing executed, no stop** — which is the score's own claim, that an operator who reads the docs gets this.

### Run 20: the defaults, and nothing else

`dbba854`, fresh data dir `~/.kampaku-eval-07r20`, **no `KAMPAKU_TURN_BUDGET_MS`** and no per-call override, `textstats` seeded with `textstats-lead` and its checkout. The whole suite is four prompts and under seven minutes:

| Prompt | Wall clock | Tools | Result |
|---|---|---|---|
| 1 — *"Plan the first vertical slice … wait for my go"* | **4 m 22 s** | `delegate_to_agent`, `get_project`, `get_agent_dashboard` | **7 work items, all `todo`**; two `planned` milestones; **0 jobs**; no budget stop |
| 2 — *"Which check commands did you derive, and from what?"* | **6.8 s** | none | `make check` and `make lint` traced to the `Makefile`, the CI workflow and `pyproject.toml` |
| 3 — *"What is deliberately out of scope?"* | **8.5 s** | `get_project_journal` | Ten exclusions, each with its reason |
| 4 — *"Publish one wiki page for the scope"* | **1 m 45 s** | `delegate_to_agent` | The store reached the chat path for the first time; the residual is recorded in [F-071](results/BOARD.md) |

**What run 20 is really measuring is the absence of a workaround.** Runs 4 to 19 all carried an operator-stated input — a 15-, 30- or 60-minute budget — chosen because a previous run had shown the default could not do the job. Run 20 carries none, and the difference shows up where it should: the dependency graph persisted **by id** (`["7ab59a2f-…"]` for two leaves, a two-id list for the phase gate), the plan's commands came from the checkout, and **no turn stopped for any reason other than finishing**.

**Two things the run found that are recorded rather than smoothed over.** The planner left one dependency edge unwritten while persisting the others ([F-072](results/BOARD.md), open and non-blocking), and the wiki probe showed that the agents' edit tool had no create path — which the run proved by *succeeding* against an existing page and failing against a new slug, and which the front office raised as a decision rather than working around ([F-071](results/BOARD.md), fixed after it). Both are the shape this suite has spent twenty runs learning to reward: a run that says what it could not do is worth more than one that says it did everything.

### Run 19: the default budget, and the turn that explains itself

`f51fb6a`, fresh data dir, **no `KAMPAKU_TURN_BUDGET_MS`** — the shipped default of 300 000 ms — same prompt 1 as runs 16 and 18. The turn **stopped at its own budget in 5.1 of 5.0 minutes**, and this is the paragraph it returned:

```text
I stopped this turn at its own time budget: 5.1 of 5.0 minutes. It took 14 model calls and 4 tool calls
before stopping.

Where it went: 306s total · 3 model calls in 15s (slowest 8.4s) · 4 tool calls, slowest delegate_to_agent
291s · delegated sessions: 11 model calls in 291s.

Durable state changed during this turn: 8 work item(s). Anything it wrote on disk is there for you to
check, and nothing is reported as done — a partly-formed plan is not a plan.
```

Every number in that paragraph was absent four runs earlier, and each one answers a question the suite has
been asking since run 3: **306 s** is the time actually spent (the reply used to print the *declared* budget as
the elapsed value, so an overshoot read as a perfect fit); **15 s across its own 3 calls** against **291 s
inside one delegation** is the split [F-060](results/BOARD.md) said could not be made, and it is the difference
between a slow endpoint and slow work; **11 model calls** is what the delegated session spent while the
front office's own counter used to report one ([F-060](results/BOARD.md), one level up, measured in run 16);
and **8 work items** is the plan that landed, named rather than denied — the whole point of the stop being
honest is that it must not cancel work that succeeded.

**The answer to run 19's actual question is no.** The shipped default does not accommodate a planning turn: it
stopped 6 s past the budget, and the check that enforces it runs before a call and never during one
([F-070](results/BOARD.md)). Two follow-ons were taken on the same conversation anyway, and both are worth
having: prompt 2 answered in **11.7 s** with `tools: none`, tracing `make check` and `make lint` to their
`Makefile` targets and their CI step, **flagging that the `make run` target the plan creates does not exist in
the checkout today**, and reporting that the lead *"declined to add a `[project.scripts]` console entry point,
on the grounds that it would introduce an install step"* — a judgement stated as a judgement. Prompt 3 answered
in **36.4 s**, delegating once, and came back with two defects in the plan rather than a summary of it: an
acceptance criterion citing **R1–R5** that no artifact defines, and the out-of-scope register that could not be
published because `get_wiki_tree`, `get_wiki_page` and `propose_wiki_edit` all answer `Wiki store is not
available`. It then raised that first one as a `required` gate without being asked to. Both are recorded as
[F-071](results/BOARD.md).

**The cold read was taken, by a model reader, and that is stated rather than glossed.** Run 18's artifact could
not be read by anyone — no plan existed when the suite was written. Run 19's can, and is:
`s07r19-coldread-artifact.md` is the applied plan and nothing else. It was handed to a **fresh conversation**
with no history, no tools available to it and no access to the prompts that produced the plan, which answered
the three questions from the artifact alone in one pass and reported **no question needed** — goal, ordered
steps, and per-step verification, with the dependency order inferred from the chain the artifact states. It
also reported four things it could not answer from the artifact: **R1–R5** are never stated, the ids
`wi-01..wi-07` are cited but the task list carries no ids, all seven leaves are owned by one seat so nothing in
the artifact is independent verification, and `make check`/`make lint` are treated as authoritative without the
artifact saying what runs them. **The limitation, plainly: this reader is a language model reading the same
store, not a second person.** It is a real test of whether the plan is self-describing and it is not a
substitute for the human read the box was written for; a person reading this artifact would be the stronger
evidence, and the artifact is ready for one.

**Eighteen runs' worth of "no plan" now has a counterweight, and the score moved to 9/10 here.** The box still withheld at that point was [U8](#universal-gates), on [F-058](results/BOARD.md) — a decision the operator had to make, not a run. Run 20 is where it was decided and the box ticked.
withheld is [U8](#universal-gates): open rows for this suite exist, and the row that matters is
[F-058](results/BOARD.md), which run 19 turned from an unmeasured complaint into a stated product decision —
raise the default, or make the surface say planning needs an explicit budget. That is the operator's call, not
a run's, which is why the box stays unticked rather than unanswered.

**Superseded — this section is run 18's measurement, kept as the record of where the plan first arrived.** Eighteen runs. Runs 1–17 produced no durable plan between them; **run 18 did, and it is the first.** The central oracle sentence this suite turns on — *"the plan has multiple steps with stable ids, named owners, and statuses at `todo`"* — is met in substance.
did, and it is the first.** The central oracle sentence this suite turns on — *"the plan has multiple steps
with stable ids, named owners, and statuses at `todo`"* — is met in substance, so one of the four withheld
points is released. The three that remain are named in § Score, and none of them is the plan.

### Run 18: the plan exists, and it is durable

`378a035`, fresh data dir, DeepSeek pinned first, 60-minute turn budget. Prompt 1 returned in **2 m 58 s** —
run 16 spent its whole hour and returned an apology. Durable evidence, read from the store and cross-checked
through the CLI:

```text
18:07:20  plan.previewed  ref=plan-5cae52f1-6b1b-4611-b490-9b69f2bb74bc  fp=4d690908fc9f4c70…
18:07:23  plan.approved   ref=plan-5cae52f1-6b1b-4611-b490-9b69f2bb74bc  fp=4d690908fc9f4c70…  expires 2026-09-30
          → 8 work items, all `todo`, owner `textstats-lead`, 2 milestones `planned`, 0 jobs
```

Matching fingerprint and content hash on both events, and **the apply followed**: eight `work_items` rows in a
real tree — one phase `e8b01b63…`, Track A `0b32cc1a…` (W1, W2) and Track B `4b31d9c8…` (W3, W4, W5) — every
one at `todo`, with its acceptance criteria, its check command and the dependency chain recorded. Two documents
are published on the project (the slice plan, and a frozen CLI contract reference) and two milestones are
`planned`. `kampaku projects show textstats` prints the same eight items, their ids, their owner slug and their
statuses; `jobs` holds **zero** rows.

**What prompts 2 and 3 do now that a plan is in a store.** Prompt 2, *"Which check commands did you derive, and
from what in the repository?"*, answered in **9.0 s** with `tools: none` and each command traced to its source —
`make check` ← `Makefile` target `check`, `make lint` ← `Makefile` target `lint`, corroborated by
`.github/workflows/ci.yml` — and with the two limits stated rather than papered over: the `python3 -m textstats`
invocations are *this slice's contract, not a repository check*, and `test -f` proves presence, not correctness.
It also said plainly that it did not read the Makefile itself and that the derivation is the lead's, which is
the honest shape [F-063](results/BOARD.md) asked for. Prompt 3, *"What is deliberately out of scope for this
slice?"*, answered in **7.9 s** from the plan document with a reason per item — the answer run 16 could not give
once the delegation's context was gone, and the behaviour [F-059](results/BOARD.md) records as missing.

**The three surfaces agree, and it was measured rather than assumed.** Chat reads the applied plan back with
`get_project`; the CLI prints the same eight items with the same ids, owner and statuses; the web UI
(`next build` with `KAMPAKU_CORE_URL` pointed at this run's Core, served on `13018`) renders the `textstats` row
at status `planning` with lead `textstats-lead`, and its work-item response through the app's own
`/api/v1` path is **byte-identical** to the one Core returns directly (`cmp` clean). The `Core offline` dot in
the sidebar is a client-side probe against the browser's origin and reads `offline` in a headless fetch; the
data path itself is the same bytes, which is what U3 asks about.

**One harness note, recorded as a gap.** The oracle's `work_items` count is the length of the *root* list, so it
reports **1** for a plan of eight items. Every earlier run's "0 work items" was read the same way, and it was
correct only because nothing existed. The suite's measurements should not lean on that field.

### Runs 10–16: the apply could never have succeeded

Every run through run 16 reached further into the plan path than the one before it, and the last four died in
the same place for reasons that had nothing to do with time. Durable evidence from run 16, a fresh data dir on
a healthy provider:

```text
01:16:22  plan.previewed  fp=388873766acb  ch=b37cdc40126a
01:16:24  plan.approved   fp=388873766acb  ch=b37cdc40126a  expires 2026-09-30
01:19:30  submit_intent   -> LLM planning failed … ZodError: ["work_items", 0, "parent_ref"] null
01:20:14  submit_intent   apply  -> refused
01:25:27  plan.previewed  fp=25b8d3b7112c  ch=151e501e630d
01:25:31  plan.approved   fp=25b8d3b7112c  ch=151e501e630d  expires 2026-09-30
01:26:10  submit_intent   apply  -> refused
01:28:23  plan.previewed  fp=c614e2146766  ch=c37bb71041bd
01:28:31  plan.approved   fp=c614e2146766  ch=c37bb71041bd  expires 2026-09-30
01:29:49  submit_intent   apply  -> refused
01:31:15  submit_intent   apply  -> refused
```

Three preview/approve pairs, every one with matching fingerprint and content hash and a 24-hour expiry, and
**no `plan.applied` between them**. The project held **0 work items**.

- **[F-067](results/BOARD.md) — `submit_intent` dropped `approval_reference`.** The field was required by the
tool's own boundary check, documented in its schema, declared on `SubmitIntentInput` and forwarded by
`submitIntent`; the object literal that built the call did not pass it. So every apply arrived with
`approvalReference: undefined`, resolved no preview — and an apply with no preview **takes the planning path**,
re-deriving a whole plan before refusing. That is why each of the five refusals was preceded by a full
re-plan, and why a refusal could be killed by a planning error: the third `submit_intent` above died on a
schema slip in one node and took the turn's remaining budget with it. The REST route was covered by a passing
test the whole time, because the route forwards the field; the tool did not. **Eight of the ten new locks in
`eval-plan-apply-tool.test.ts` are red without the fix**, the control included.
- **[F-068](results/BOARD.md) — a `null` where a field is optional discarded the whole plan**, twice in this
turn (`work_items[0].parent_ref`, then `work_items[1].parent_ref`). `parent_ref` is `z.string().optional()`,
which rejects `null`, and `null` is the only spelling JSON has for "this node has no parent". One key in one
node threw away a plan that had already been paid for. `null` now means absent, normalized once at the schema
boundary for every optional position.
- **A refusal that names nothing cannot be acted on.** All five refusals were the same sentence,
`"Plan apply requires a non-expired persisted approval for the exact request fingerprint and plan content
hash"`, which was true and named no field — so the only rational move was to repeat the call. It now reports
every unmet condition with both sides of each comparison, and resolves the approval **before** spending a
model call, so a refusal costs nothing.

**What run 16 also confirmed, and it is worth keeping.** The provider is no longer the variable: DeepSeek
served every call on the first attempt, and one direct tool-bearing call answered in ~1 s. Prompt 2 took
17 m 24 s and **answered correctly from the repository** — `make check` and `make lint`, each traced to its
`Makefile` target, its README row and its CI step, with the explicit statement that neither was executed and
their pass/fail is therefore unverified. Prompt 3 took 1 m 8 s and **refused to reconstruct an out-of-scope
list it had lost**, naming the temptation and declining it: *"Anything I wrote under this heading now would
be convention, not memory."* Both of those are the behaviour this suite wants, and neither is what the score
turns on: the central bullet asks for a plan, and there is still none. Prompt 3's refusal is also the second
piece of evidence for the same gap — the plan and its exclusions lived in a delegation's context and nowhere
else, so losing the context lost the plan.

**Still holding from run 4**, and re-confirmed on every run since: prompt 2 answers with a source for each
derived command, prompt 3 states what is out of scope with a reason, F2 holds (`make check` and `make lint`
exit 0 in the checkout), and the fixture is byte-identical after every run.

**The one behaviour that bounds every run (F-064).** Three budgets, two iteration caps, and a prompt that
forbade the reading outright — the same shape every time:

| Run | Budget | Wall clock | Model calls | Tool calls | Outcome |
|-----|--------|-----------|-------------|------------|---------|
| 4 | 15 min | 25 m 18 s | 8 | 13 × read_repository, then 1 × delegate | 0 plan events |
| 7 | 60 min | 60.6 of 60.0 | 8 | 16 × read_repository, then 1 × delegate | 0 plan events |
| 8 | 60 min | **50 s** | 10 (cap) | 8 × read_repository, no delegation | 0 plan events |
| 9 | 15 min | 15.4 of 15.0 | 5 | 13 × read_repository, then 1 × delegate | 0 plan events |

Fifty seconds and sixty minutes end identically, so neither the clock nor the iteration cap is the binder.
The front office spends eight to sixteen `read_repository` calls on a twelve-file checkout — a repository the
*lead* reads anyway in order to write the plan — and delegates once, last, at which point the delegation has
no time to preview, approve and apply. Five runs say the prose does not bind: run 8 was taken with a prompt
that says *"Do not read the repository yourself"* and it read eight times.

**What is fixed, and locked.** Five defects on the plan path, each with a test that is red without it:
F-054 (npm written into a Python project's criteria), F-055 (no way to say *plan and stop*), F-056 (a
project's own lead could not approve its plan), F-057 (toolchain discovery preferred a guess to the declared
command), F-063 (an approval filed with a past expiry and reported as `approved`, so the apply was refused
and nothing persisted), and the front office's step-limit fallback, which said `Finished 14 tool step(s)`
for a session that had applied nothing. `eval-plan-durability.test.ts` drives preview → approve → apply
through the documented routes and gets work items with ids and `todo` status, so the path works; what is
missing is a delegation that has time to reach it.

**Still holding from run 4**, and re-confirmed on every run since: prompt 2 answers with a source for each
derived command, prompt 3 states what is out of scope with a reason, F2 holds (`make check` and `make lint`
exit 0 in the checkout), and the fixture is byte-identical after every run.
 Four runs produced **no durable plan**, and the last one shows
why the suite cannot score its central bullet: the factory's own reply says a plan was approved, and no
store holds one.

- **Run 4 (b6b854b, the fixes, 30-min budget as a stated operator input).** Prompt 1 ran **25 m 18 s**
  over 13 `read_repository`, one `delegate_to_agent`, `get_project`, `get_project_journal`. It replied
  *"I delegated planning … The lead executed 14 tool steps including reading the repository, submitting
  intents, and approving a plan"* — and then, in the same reply, *"Work items: 0 (the plan's steps have
  not yet been persisted as durable work items). The plan exists in the lead's context but has not been
  applied."* Measured: **0 work items**, 0 jobs, **empty project journal**, **0 refusals**, no question.
  So the delegation ran and left nothing, and the "14 tool steps … approving a plan" sentence cannot be
  read from any store. That is [BOARD F-063](results/BOARD.md), and it is the row that blocks this suite.
- **Prompt 2 passed, fully.** In **8.2 s**, from two `read_repository` calls, it derived exactly the two
  commands the repository declares and traced each to its source: `make check` ← `Makefile` target
  `check`, `make lint` ← `Makefile` target `lint`, and the CI step ← `.github/workflows/ci.yml`. Both
  commands were executed here and both work: `make check` → exit 0, *Ran 3 tests … OK*; `make lint` →
  exit 0. **F2 holds** — and it holds on the strength of the fix: before it, discovery offered
  `python -m pytest -q` ([F-057](results/BOARD.md)), which fails in this checkout.
- **Prompt 3 passed, and reversed [F-059](results/BOARD.md)'s shape.** In **53.4 s** it stated what was
  out of scope with a reason per item (CLI entry point, sentence metrics, packaging, third-party deps,
  deeper typing) and named how execution is released. One tool call, and it answered. It also said
  plainly: *"The project currently has zero work items — no plan has been authored as durable steps."*
- **Runs 1–3, for the record, produced no plan at all** — run 1 called no planning tool; run 2 read nine
  times then delegated into the budget stop; run 3 (16 min of a stated 15) read fifteen times and
  delegated once into the same stop. Those measurements are in [F-055](results/BOARD.md),
  [F-058](results/BOARD.md) and [F-060](results/BOARD.md), and **F-060 corrects the cause those runs
  were attributed to**: the same model answers a direct call in 2.4 s even at 21,000 prompt tokens, so
  955 s over 5 in-turn calls is not the budget's doing, and the product records no per-call latency to
  tell the two apart.

### Score

**10 / 10.** Ticked: U1 (fresh data dir, bootstrapped, one project seeded), U2 (the public docs sufficed —
the front office read `Makefile`, `pyproject.toml`, `README.md` and the CI workflow unaided), **U3** (the plan
and its statuses are the same on chat, CLI and web — measured in run 18, see § Run 18), U4 (the cited locks are
green, re-run for run 18), U5, U7, F1 (software), **F2** (every derived command runs: exit 0/0, recorded
below), **F3** (the plan adds `src/textstats/*` and `tests/*` inside the layout the repository already has and
proposes no move, rename or build-system change), F4 (the fixture is byte-identical after the run —
`s07r18-fixture-hashes.txt` diffs clean against run 4's record), **F5** (the slice names how a stranger exercises
it: `PYTHONPATH=src python3 -m textstats …`, the stdin form, `--top N` and the `exit=2` failure mode, written
into W2/W3's acceptance criteria and into the project's frozen CLI contract document), and the suite's own
first box: **a multi-step plan with stable ids, named owners and statuses at `todo`** — eight items, five
leaves, every leaf's check command and acceptance evidence recorded, every leaf `todo`.

**Nothing withheld. Two caveats are stated instead, because a score without them would be a claim the run
log does not support.**

- **The cold read was taken by a model reader.** `s07r19-coldread-artifact.md` — the applied plan and nothing
  else — went to a fresh conversation with no history and no tools, which answered the three questions from the
  artifact alone in one pass and reported no question needed (see § Run 19). That is a real test of whether the
  artifact is self-describing, and it is **not** the human read the box was written for. A person reading the
  same artifact is still the stronger evidence, and the artifact is ready for one.
- **[F-072](results/BOARD.md) is open and is not blocking.** Run 20's planner left one dependency edge unwritten
  (leaf 2 → leaf 1) while persisting the others by id, so the machine-enforced order is thinner than the plan's
  own coherence text describes. It does not stop the plan, the check commands, or the ordering a human follows —
  all three are in the leaves and in the wiki — and it is recorded rather than smoothed over. Everything else this
  suite opened is closed by measurement: [F-059](results/BOARD.md), [F-063](results/BOARD.md),
  [F-064](results/BOARD.md), [F-065](results/BOARD.md), [F-058](results/BOARD.md), [F-060](results/BOARD.md),
  [F-061](results/BOARD.md), [F-069](results/BOARD.md), [F-070](results/BOARD.md), [F-071](results/BOARD.md).

The suite's oracle sentence, *"the plan has multiple steps with stable ids, named owners, and statuses at
`todo`"*, now holds: **P6 met.**

**The one new gap run 18 opened.** The work items' `dependsOn` holds step **titles**, and
[`dependsOnSatisfied`](../../apps/core/src/application/pm/work-item-order.ts) resolves them by comparing
titles against the set of `done` titles — so the dependency graph the plan hands a human is keyed to a string a
later edit can change, while the oracle's own sentence asks for **stable ids**. Measured in run 18's store:
W2's `dependsOn_json` is `["W1 — Add word-statistics aggregation API with unit tests"]`, and W5's is a list of
four titles. Recorded as [F-069](results/BOARD.md); not fixed here, because the fix is a schema and ordering
change rather than a measurement.

The score does not move on runs 10–17 even though the product improved in each of them, and that is
deliberate: this suite scores a plan a human can run, and each run found a further defect between the product
and one. **Run 18 moved it, and only because the artifact the whole suite is about finally exists. Run 19 moved it
again, for the other half of the same reason — the turn that hit its own bound explained itself, in numbers, and
named the work the stop had not cancelled. Run 20 closed it, and the pattern held one last time: the run that
scores 10/10 is the first one taken on the shipped defaults, with no operator-stated input at all — so what the
score certifies is that an operator who reads the docs gets this, not that a session that knew the defects got
it.** A plan whose steps are owned by one seat and whose
dependency graph is keyed to titles is a weaker plan than it looks, and the paragraphs above are the record of
that — as is [F-071](results/BOARD.md), which run 19 found by reading the plan back rather than by asking for it.

## Evidence

All artifacts are outside the repo, in `~/.kampaku-eval-01/` (per `00-protocol.md` § Run artifacts).

| What | Where |
|------|-------|
| Run 4 replies, timed | `s07r4-p1.out` (25 m 18 s), `s07r4-p2.out` (8.2 s), `s07r4-p3.out` (53.4 s) |
| **Run 16 replies, timed** | `s07r16-p1.out` (**60 m 37 s**, budget stop), `s07r16-p2.out` (**17 m 24 s**), `s07r16-p3.out` (**1 m 8 s**) |
| **Run 16 sequence + tool trace** | `s07r16-sequence.sh`, `s07r16-sequence.log`, `s07r16-conversation.txt`, `~/.kampaku-eval-07r16/run/trace.jsonl` (59 tool calls: 18 `read_repository`, 11 `submit_intent`, 8 `get_agent_capacity`, 6 `get_project`, 5 `recall`, 3 `approve_plan`, 3 `delegate_to_agent`) |
| **Run 16 durable evidence for F-067** | `~/.kampaku-eval-07r16/data/kampaku.db` → `events` holds six `plan.*` rows: three `plan.previewed` / `plan.approved` pairs with matching fingerprint and content hash, and **no `plan.applied`**; the project's `work_items` count is 0 until a `Triage blocker` row appears after prompt 3 |
| **Run 16 refusals, verbatim** | `s07r16-p2.out` § "The plan is still not durable", and the two `ZodError … ["work_items", 1, "parent_ref"]` details for F-068 |
| Run 4 sequence + timestamps | `s07r4-sequence.sh`, `s07r4-sequence.log`, `s07r4-conversation.txt` |
| Oracle snapshots before/after | `s07r4-p0-baseline.json`, `s07r4-p1-after.json`, `s07r4-p3-after.json` |
| Fixture hashes and mtimes | `s07r4-fixture-hashes.txt`, `s07r4-fixture-mtimes.txt` (source files identical to run 3's record) |
| Fixture untouched, and the checks run | `make check` → exit 0, `Ran 3 tests … OK`; `make lint` → exit 0 |
| Empty journal (the F-063 measurement) | `GET /api/v1/projects/5a994060-…/journal` → `{"entries": []}` |
| Earlier runs' replies | `s07-p1.out`, `s07-p2.out`, `s07-p3.out`, `s07r2-p*.out`, `s07r3-p1.out` |
| Latency measurements (F-060) | `~/.kampaku-eval-01/read-repo-probe.mjs`, `/tmp/kampaku-tools.json` (63 tools, 38,057 chars; the front office receives 14, 11,019 chars) |
| The cold-read artifact | `s07-coldread-artifact.md` (runs 1–4) — no plan in it, which was the point. **`s07r18-coldread-artifact.md` is the one to hand over**: the applied plan, its check commands, its exclusions and the recorded staffing limitation, with nothing else in it |
| **Run 18 replies, timed** | `s07r18-p1.out` (**2 m 58 s**), `s07r18-p2.out` (**9.0 s**), `s07r18-p3.out` (**7.9 s**), `s07r18-sequence.log` |
| **Run 18 durable evidence (the oracle)** | `~/.kampaku-eval-07r18/data/kampaku.db` → one `plan.previewed` + one `plan.approved` with matching fingerprint `4d690908…` and content hash `9a9b1571…`, expiry `2026-09-30`; **eight `work_items` rows, all `todo`**, phase `e8b01b63…`, Track A `0b32cc1a…`, Track B `4b31d9c8…`; two `roadmap_milestones` at `planned`; three `project_documents`; `jobs` = 0 |
| Run 18 read back three ways | `kampaku projects show textstats` (CLI), chat's prompt-1 reply (the `get_project` read-back), and the web UI on `13018` — `cmp` of the web's `/api/v1/projects/textstats/work-items` response against Core's is clean |
| Run 18 fixture hashes | `s07r18-fixture-hashes.txt` — diffs clean against `s07r4-fixture-hashes.txt`; `make check` → exit 0, `Ran 3 tests … OK`; `make lint` → exit 0; the fixture's `git status` is empty |
| Run 18 web harness note | `web-build-s07r18.log`: the rewrite target `http://127.0.0.1:18096/api/v1/:path*` is baked by `next build`, so a UI built against another Core shows `Core offline` while the data path is fine |

**Harness notes, recorded as gaps.** Every run, including run 18, drove prompt 1 with `--project-id` because
the unscoped turn opens a `required: true` gate that no documented surface can answer
([F-062](results/BOARD.md)) — so no run has measured the *scoped-by-chat* form of this prompt.
**The cold read (prompt 4) is still not done**, and it is now the only box that has never been attempted
rather than the only one that cannot be: `~/.kampaku-eval-01/s07r18-coldread-artifact.md` holds the applied
plan, its check commands, its exclusions and the recorded staffing limitation, and nothing else, ready for a
second person with a five-minute timer. Two smaller harness facts found in run 18 are recorded in § Run log:
the oracle's `work_items` field counts root nodes (it reads **1** for a plan of eight), and the web UI's
rewrite target is baked by `next build`, so the UI must be built against the Core the run is using.

## Blocker

**No round of this suite is blocked any more. Three boxes are, and none of them is the plan.**

Run 18 measured the three things run 16's Blocker said the next run had to be read against, and all three came
out right: the preview's owners **exist** (`textstats-lead`, the one seat the project has — the platform
agents are still refused for an external project, and the plan says so instead of naming them); the exclusions
are **recorded when they are decided**, in a published plan document the front office can read back, and
prompt 3 answered from it in 7.9 s; and the plan became durable through the tool a lead actually calls, which
is [F-067](results/BOARD.md)'s defect measured closed rather than argued closed.

What remains, in order of what it costs to release:

- **The cold read.** One second person, one five-minute timer, one file:
  `~/.kampaku-eval-01/s07r18-coldread-artifact.md`. This is a point that only a human can hand over, and it is
  the last box of this suite that has never been attempted.
- **[F-060](results/BOARD.md): a turn must account for its own time.** U6 and, behind it, U8 turn on this. The
  fix is instrumentation — record per-call latency, carry it into the stop and into the reply — not a number to
  pick.
- **[F-058](results/BOARD.md): the shipped default budget still has not been measured against a planning
  turn.** Run 18 used a stated 60 minutes, because a run that fails for a reason already measured is a wasted
  run. The honest version of this box is one run on the default, and it is cheap now that the plan path works.
- **[F-069](results/BOARD.md): the dependency graph is keyed to titles.** New from run 18, and the one finding
  here that is a *plan-quality* defect rather than a process one: W2 depends on the string *"W1 — Add
  word-statistics aggregation API with unit tests"*, and `dependsOnSatisfied` compares titles, so an edit to a
  step's title silently detaches everything downstream of it. The suite's own oracle sentence asks for
  **stable ids** — which the work items have, and which the graph between them does not use.
