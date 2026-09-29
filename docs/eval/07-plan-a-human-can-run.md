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
- [ ] U3 Plan and statuses visible identically on chat, CLI, and web — **cannot be ticked: there is no plan.**
      The three surfaces agree on everything they do hold (chat names `textstats`; `projects list` prints it at
      status `planning`; the oracle reads the same), but the box asks about a plan's statuses and none exists.
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix — run 4 is a fresh data dir *after* the four fixes. **Honest
      caveat:** like suite 06, this is the first run on the fixed tree; nothing has been re-run a second time
      on an unchanged tree.
- [ ] U6 No silent budget failure hiding the oracle — **withheld.** Run 4's prompt 1 spent 25 m 18 s and the
      reply never says where the time went; the same model answers a direct call in 2.4 s even at 21,000
      prompt tokens ([F-060](results/BOARD.md)). A stop that cannot distinguish a slow provider from slow work
      is the silent failure this box exists to catch, even though the turn did not stop on the budget.
- [x] U7 Pass criteria stay product-level — every box was restated as an observable property of the product
      (persisted steps with ids, commands that run, a stranger who can restate the plan), never as a property
      of the harness.
- [ ] U8 No open blocking BOARD row for this suite — **withheld and it is the binary.** [F-063](results/BOARD.md)
      (a delegation reports a plan approved and no store holds one) and [F-058](results/BOARD.md) are open.
- [x] F1 Deliverable is software — the fixture is a real Python package with a manifest, a Makefile, a test
      suite and CI; the product's own deliverable was the plan, which is the part that failed.
- [x] F2 **Every check command runs in this project's toolchain** — the two commands the reply derived were
      executed here: `make check` → **exit 0**, `Ran 3 tests … OK`; `make lint` → **exit 0**. No `npm`-shaped
      command appears anywhere in the reply, and the pre-fix discovery that offered `python -m pytest -q`
      (which fails here) is [F-057](results/BOARD.md), resolved.
- [ ] F3 Plan respects the existing package and module boundaries — **cannot be ticked: there is no plan.**
      Note the shape: prompt 3 described the slice as *"the library module that already exists"* with the CLI
      as the next slice, which is boundary-respecting, but it is prose about a plan, not a plan.
- [x] F4 No restructuring of an existing codebase — the fixture's twelve source files are byte-identical after
      the run (`s07r4-fixture-hashes.txt` vs run 3's record; the fixture's `git status` is empty). Only
      `__pycache__` appeared, from `make check`/`make lint` being executed, and it is gitignored.
- [ ] F5 The slice names how it will be exercised by a stranger — **cannot be ticked: there is no plan.** The
      reply names the surface that releases execution (`kampaku projects play|step textstats`), which is not
      the same thing.

### Suite-specific

- [ ] Multi-step plan with stable ids and owners — **no plan exists**
- [x] Every check command executed and recorded — `make check` exit 0, `make lint` exit 0 (F2 above)
- [ ] Acceptance evidence is executable or inspectable — **no plan exists**
- [x] Out-of-scope stated with reasons — prompt 3, five items each with a reason, in 53.4 s
- [ ] Cold read succeeded in five minutes — **not attempted**; there is no plan to read
- [x] Zero jobs, nothing marked done — 0 jobs, 0 work items, nothing done. Ticked because it is exactly
      what was measured, though it is a strange thing to tick when the reason is that nothing was planned
- [x] Prompt 2 traces each command to its source — `make check` ← `Makefile` target `check`; `make lint` ←
      `Makefile` target `lint`; CI ← `.github/workflows/ci.yml`

### In-scope P-gates

- **P1** soft (nothing marked done) · **P6** required · **P8** if any step touches existing code

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-plan-quality.test.ts` | Multi-step plan with owners and ids, statuses todo, out-of-scope recorded, zero jobs | **Authored and green** (3 tests, `b6b854b`) |
| `apps/core/tests/eval/eval-plan-evidence-derivation.test.ts` | Plan check commands derived from the repository toolchain, not from a template | **Authored and green** (4 tests; 2 were red before the fix, verified by reverting the fragment) |
| `apps/core/tests/pm/phase-key-and-plan-hash.test.ts` | Plan preview/approval integrity | Exists; re-run and cite |

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-28 (sixteen runs: r1/r2 default budget, r3 `900000`, r4 `1800000`, r5 `1800000` + the plan-path fragment fix, r6 `1800000` cut off by the CLI's own 1800 s ceiling, r7 `3600000`, r8 60-min budget with the reading forbidden by prompt, r9 `900000` with the iteration cap at 24, r10–r15 in order as each row landed, **r16 `3600000` on the run-15 fixes with DeepSeek pinned first**) |
| Data dir | `~/.kampaku-eval-07/data` (r1), `…-07r3/data` (r3), `…-07r4/data` (r4), `…-07r16/data` (r16) |
| Git SHA | **`cb27b77` (F-066) at run 16**; `d896303` at run 9, `46184ce`/`9f090bc` at run 8, `134e8ca` at run 7, `21530b2` at run 6, `b6b854b` at run 4–5 |
| Model / provider | production endpoint `http://127.0.0.1:3001/v1`, FreeLLMAPI `auto:escalera` → **`deepseek-flash`**, pinned at priority 1 so every call is served on attempt #0 |
| Wall clock | run 4: prompt 1 **25 m 18 s**, prompt 2 **8.2 s**, prompt 3 **53.4 s**; run 16: prompt 1 **60.6 of 60.0 min** (1 front-office model call, 1 tool call — the whole budget went into one `delegate_to_agent`), prompt 2 **17 m 24 s**, prompt 3 **1 m 8 s** |
| Cold reader | **not done** — the artifact that would be handed over is in `~/.kampaku-eval-01/s07-coldread-artifact.md` and there is still **no plan in it to read** |
| Tests | `eval-plan-quality` 3 ✓ · `eval-plan-evidence-derivation` 4 ✓ · `project-toolchain` 14 ✓ · `eval-local-ports` 7 ✓ |

## Result

**MEASURED — binary NOT met, 6/10.** Sixteen runs. The score is unchanged from run 4 because the finding is
unchanged in one respect and sharper in every other: **no run has ever produced a durable plan.** Runs 10–16
explain exactly why, and it was not the budget.

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

**6 / 10.** Ticked: U1 (fresh data dir, bootstrapped, one project seeded), U2 (the public docs sufficed —
the front office read `Makefile`, `pyproject.toml`, `README.md` and the CI workflow unaided), U4 (all four
cited locks green), F1 (software), **F2** (every derived command runs: exit 0/0, recorded below), F4 (the
fixture is byte-identical after the run), U5, U7, F4. **Four points withheld, each with its reason:**
the central oracle bullet itself (there is no durable plan — [F-063](results/BOARD.md) and, through run 16,
[F-067](results/BOARD.md)); U8 (those rows and [F-058](results/BOARD.md) are open and blocking); U6 (the turn
does not say where its 25 minutes went — [F-060](results/BOARD.md), and by run 16 it also cannot: a 60-minute
turn reported *"1 model calls and 1 tool calls"* while the delegation it waited on made 5 and 17); and the cold
read, which is unrunnable while the artifact contains no plan.
U3 and F3/F5 are blank on the same fact — the boxes ask about a plan, and there is none.

The suite's own oracle sentence decides it: *"the plan has multiple steps with stable ids, named owners,
and statuses at `todo`"*. There is no plan. **P6 unmet.**

The score does not move on runs 10–16 even though the product improved in each of them, and that is
deliberate: this suite scores a plan a human can run, and each run found a further defect between the product
and one. A score that rose for the defects found would report progress the oracle cannot see.

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
| The cold-read artifact | `s07-coldread-artifact.md` — **still no plan in it**, which is the point |

**Harness note, recorded as a gap.** Run 4's prompt 1 was driven with `--project-id` because the unscoped
turn opens a `required: true` gate that no documented surface can answer ([F-062](results/BOARD.md)).
The cold read (prompt 4) is **not done**: handing a reader an artifact whose content is *"nothing was
created"* measures the artifact, not the promise, and the promise is a plan. It stays undone until there
is a plan to read.

## Blocker

**[BOARD F-067](results/BOARD.md) is resolved, and the next run is the first that can reach the apply.**
Runs 4–16 each spent their whole budget reaching, or failing to reach, the last step of the plan path; the
step itself was unreachable through the tool a lead calls, because `approval_reference` was dropped before it
got there. The plan it was for is the suite's central oracle.

What the next run has to show, therefore, is no longer *whether a plan can be made durable* but what the plan
says. The oracle bullet that has never been scored reads: *"the plan has multiple steps with stable ids, named
owners, and statuses at `todo`"*. Three things the run before this one already flagged and that the next one
must be read against:

- **Owners that exist.** Run 16's previews named `textstats-fullstack`, `textstats-qa`, `textstats-documenter`
and `textstats-auditor`, none of which existed, plus `kampaku-*` platform agents, which are reserved for the
platform's own project and cannot be assigned to an external one. A plan whose steps are owned by nobody is
not a plan a human can run, so this is an oracle risk rather than a cosmetic one.
- **Exclusions recorded when they are decided.** Run 16's out-of-scope list existed only inside a delegation's
context, and by prompt 3 it was gone — the front office could neither recall it nor honestly reconstruct it.
- **Where the 60 minutes went.** Prompt 1 reported *"1 model calls and 1 tool calls"* while the delegated
session it was waiting on made **5 model calls and 17 tool calls** (the front office's own correction, in
prompt 2). The turn's counters do not cross the session boundary, so a budget stop under-reports the work by
4× on model calls and 17× on tool calls — the same defect shape as [F-060](results/BOARD.md), one level up.
Querying `recall`, `remember_log` and the delegation events for the same period found no record of the first
call's contents, so the run's own accounting of itself is the only account there is. **Not yet a BOARD row:**
this run did not measure whether it misleads an operator on a turn that *finishes*, and the row belongs on the
board with that measurement rather than ahead of it.
