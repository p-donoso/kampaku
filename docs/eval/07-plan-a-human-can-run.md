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

### Latest manual re-measurement

Detailed measurement and evidence are preserved in the [historical suite record](archive/07-plan-a-human-can-run-2026-10-30.md).

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
| `apps/core/tests/eval/eval-plan-a-human-can-run-ids.test.ts` | **Authored 2026-10-20 (runs 21–22).** The artifact is readable on the surface that runs it: `projects show` prints every step's id; a refused owner's finding names `kampaku agents create <slug> --parent <lead>`; an item frozen by a project-scoped question names the question and `kampaku questions answer` instead of "nothing accounts for it" | **Green** (3 tests); **verified red with all three fixes reverted** (3 failed) |

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.

## Evaluation status

The recorded verdict and checklist above remain the suite status. Detailed manual run logs, prior results, evidence, and historical blocker notes are in the [historical suite record](archive/07-plan-a-human-can-run-2026-10-30.md).

For current open product gaps, consult the [evaluation board](results/BOARD.md).
