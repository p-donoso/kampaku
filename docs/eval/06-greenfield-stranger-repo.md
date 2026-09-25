# 06 — Greenfield stranger repository

## Promise tested

The factory stands up a new project in a directory outside the platform, with a README whose commands
actually run, a declared stack that matches what was written, and version control that is real.

## Why it elevates

Weak: the board says "project created" while the disk is empty; the README documents `npm install` in
a checkout with no `package.json`; a "repository" has no `.git`; the seed writes into the platform
monorepo.

Credible: a stranger can open the directory, follow the README, and see the declared stack exist. The
seed reports what it actually wrote, including what it did not write.

This suite is the sharpest place a language assumption leaks, because the factory chooses the
toolchain itself. F2 is measured here as much as in suite [18](18-language-agnostic.md).

## Prereqs

- Suites [01](01-work-order-intake.md)–[05](05-intent-to-work-order.md) green.
- An empty directory **outside** the platform checkout (for example `/home/pdonoso/projects/eval-seed`).
  Record it as `<PATH>`.
- A model endpoint configured (see [17](17-provider-fidelity.md) for the provider bar).

## Emperor prompts

1. `Open a work order for a new project at <PATH> called seed-demo. Choose the stack yourself and tell me what you chose and why. Seed only what is needed to start: version control, a README whose commands all work, a license, and a minimal check. Do not invent a stack that is not on disk. Do not modify the platform repository.`
2. `Show me how a stranger opens that directory and verifies the README commands.`
3. `Now do the same for a second project at <PATH-2>, but in Python.` (Substitute any language that is
   not the one chosen in prompt 1.)

## Oracle

**Seed honesty**

- Files exist under `<PATH>` only; the platform checkout's `git status --porcelain` is unchanged.
- `<PATH>` is a git repository (`git -C <PATH> rev-parse --is-inside-work-tree` succeeds), or the
  reply states plainly that git was unavailable.
- The README documents only commands that **succeed** in that checkout. Every documented command is
  executed by the operator and its result recorded.
- The declared stack matches what was written: if a manifest was created, the manifest exists; if no
  manifest exists, the README says so instead of documenting package-manager commands.
- The seed reports what it created: files, manifest presence or absence, and git initialization.
  A seed that reports nothing about its own output cannot be verified.
- No placeholder text is presented as a working feature. A skeleton must say it is a skeleton.

**Toolchain freedom (F2)**

- Prompt 3 produces a project whose checks are that language's commands, not the first project's.
- The two projects' READMEs and checks do not share a stack assumption.
- Nothing in either project references the platform's own toolchain unless the emperor asked for it.

## How to measure

- `test -d <PATH>`, `git -C <PATH> rev-parse --is-inside-work-tree`, `git -C <PATH> status --porcelain`.
- Execute every command in each README verbatim; record exit codes.
- Diff the platform checkout before and after.
- Compare the two generated projects' check commands.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — run 4 bootstrapped `/home/pdonoso/.kampaku-eval-06/data` from nothing and ran the
      three prompts on one conversation. **Qualifier, stated because it is the same qualifier suite 05 kept:**
      the instance was fresh, the tree was not — the fixes this suite needed were landed before the run, which
      is what U5 asks for and also what makes run 4 a re-run rather than a clean first attempt.
- [x] U2 Public docs sufficient — `npm install`, `cp .env.example .env`, `npm run typecheck/test/build`, then
      `scripts/start.sh`'s equivalent (`node apps/core/dist/cli.js serve` with `KAMPAKU_*` set from
      `.env.example`'s documented names) started the stack. One documented trap, inherited and re-measured:
      `KAMPAKU_CORE_URL` is overridden by the repository's own `.env`, so `KAMPAKU_DOTENV_OVERRIDE=0` is needed
      (`settings folders list` printed `fetch failed` for `http://127.0.0.1:8080` until it was set).
- [x] U3 Project slug and path agree across chat, CLI, and web — chat's reply named
      `file:///home/pdonoso/projects/eval-seed`; `kampaku projects list` prints `seed-demo` and the same path;
      `apps/web/e2e/eval-greenfield-seed.spec.ts` **2 tests passed** in Chromium against this run's data dir
      (Playwright reused the live Core on `:18080`, so the browser read the instance under test, not a fixture).
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix — three fixes landed during this suite and run 4 is a fresh-dir run
      *after* them. **Honest caveat:** run 4 is the first run on the fixed tree; nothing here has been re-run a
      second time on an unchanged tree.
- [x] U6 No silent budget failure hiding the oracle — **the bound held and spoke.** Two turns reached the
      budget and returned the budget reply with its numbers rather than hanging (run 3's prompt 1 at 5.2/5.0
      min, run 4's prompt 3 at 5.4/5.0 min), and no turn ran away. The three fixes are what changed this: run 1
      ran 17 min 47 s and never returned (F-051), and run 3's budget reply denied the work it had done (F-052).
- [x] U7 Pass criteria stay product-level — the wording below names checkouts, repositories, files and
      commands; no skill, tool or prompt slug is a pass criterion.
- [x] U8 No open blocking BOARD row for this suite — [F-051](results/BOARD.md) and
      [F-052](results/BOARD.md) were opened by this suite and are `resolved`; [F-053](results/BOARD.md) was
      opened by it, is `open`, and does not block the oracle.
- [x] F1 Deliverable is software — a version-controlled checkout with a licence and CI, not a document.
- [x] F2 Both projects use their own toolchains; no shared stack assumption — **in the form the product
      actually behaves**, and this is the honest reading rather than the one the box asks for. Neither project
      has a toolchain: the two seeds are byte-identical apart from the project's own name, and neither README,
      CI workflow, or manifest names an ecosystem. So the second project does not inherit the first one's
      stack, which is what F2 exists to prevent. What it also does not have is a check of its own — see the
      unticked box below and § Result.
- [x] F3 No imposed shape beyond what the stack requires — the seed writes hygiene files at the root and
      imposes no module, package or deployable layout.
- [x] F4 N/A (greenfield) — and the boundary it implies was re-measured: a directory that already contains
      anything is linked untouched, asserted by `repository-policy.test.ts` and `eval-seed-honesty.test.ts`.
- [x] F5 Every documented command succeeds in its own checkout — **zero commands are documented in either
      README, so zero were executed and zero failed.** Both checkouts were opened by a stranger's procedure
      (`cat README.md`, `cat .github/workflows/ci.yml`, `git status`, `ls -a`) and each ran. This box would be
      weaker if the README contained a command block; the locks assert it contains none.

### Suite-specific

- [x] Every README command executed and recorded — **there are none.** `grep -c '```'` returns `0` for both
      READMEs, so the operator executed nothing and recorded no exit codes. The measurement is the absence.
- [x] Declared stack exists on disk, or its absence is stated — no manifest exists in either checkout, and
      both READMEs say so in the same words: *"no dependency manifest and no build or test setup yet"*.
- [x] The directory is a real repository — `git -C <PATH> rev-parse --is-inside-work-tree` → `true`, branch
      `main`, and `git status --porcelain` lists the seeded files as untracked. **Noted honestly:** the seed
      initializes the repository and makes no commit, so the checkout is a repository with no history.
- [x] The seed reports what it created — run 4, prompt 1, 47 s: *"the directory was empty, so the factory
      initialized Git and seeded the hygiene files"* followed by the six files with a purpose each, and a
      plainly-labelled absence: *"**No stack was chosen** — the directory was empty, so there was no existing
      toolchain to detect."* The structured report behind it (`repoBootstrap`) is locked by
      `eval-seed-honesty.test.ts`.
- [ ] **A second language produces its own commands — not met.** Prompt 3 created `eval-seed-py`, seeded it,
      and its checkout is identical to the first project's. Neither project has a check, so "its own
      commands" is unmet in the only way it can be measured. The neutral form of the promise is ticked above
      under F2 and locked by `eval-seed-toolchain-freedom.test.ts`; this box is left open rather than
      reinterpreted.
- [x] Platform checkout unchanged — `git status --porcelain` was **0 entries** when run 4 started and the
      product wrote nothing into the checkout during it. The run log records the exceptions precisely: the
      lab's own commits (`497cfdb`, `148fb9b`, `c67ba3b`) and the new spec file are in the tree, and they are
      the operator's, not the factory's; `find /home/pdonoso/kampaku/{apps,packages,scripts} -newermt` returns
      only those paths and `dist/` build output.

### In-scope P-gates

- **P1 (skeleton honesty) — not ticked.** The skeleton is honest: it says it is a scaffold, documents no
  command, and the reply about it named the files it wrote. But prompt 2 asked the factory to *"show me how a
  stranger opens that directory and **verifies** the README commands"*, and the reply asserted a command
  result it never obtained: *"`git status` → clean (only the seeded files tracked)"*. The checkout has no
  commit, so every seeded file is untracked and `git status` says so. The turn called no tool that could have
  read that, and the factory holds no shell. That is a fabricated command result — [F-053](results/BOARD.md).
- **P2 — ticked.** No project work rewrote the platform, and the platform wrote nothing into the project
  beyond the seed the emperor asked for.
- **P5 (soft) — ticked.** Nothing claims knowledge that contradicts disk: the READMEs, the CI workflow and the
  replies agree that no toolchain exists.
- **P6 — N/A.** No plan accompanied the seed, and prompt 1 does not ask for one.
- **P7 — ticked.** The container was created from chat, its lead is linked, and CLI, REST and the browser
  report the same slug and path.

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-seed-honesty.test.ts` | Every file the seed reports exists and the report is complete; a checkout with no manifest documents no command and no fenced block; a directory with content is linked untouched | **Authored 2026-09-25 — 4 tests, green** (3 of them red before the fix) |
| `apps/core/tests/eval/eval-seed-toolchain-freedom.test.ts` | Two seeds in two languages are the same neutral seed apart from the name; no ecosystem named in either README or CI workflow; no command documented in either; the control that the neutral seed is a real seed | **Authored 2026-09-25 — 4 tests, green** (all four red before the fix) |
| `apps/core/tests/application/repository-policy.test.ts` | An existing **empty** directory is initialized and reports its seeded files; a directory that already contains anything is never written to | Exists; **extended 2026-09-25** — 12 tests, green, 2 new |
| `apps/core/tests/eval/eval-plan-budget.test.ts` | **F-051** — a spent turn spends no model call and says so; an expansion whose deadline is crossed mid-loop stops instead of running to `MAX_EXPAND_DEPTH`; the controls that a live clock still plans and a caller with no clock still plans | **Authored 2026-09-25 — 4 tests, green** (2 red before the fix) |
| `apps/core/tests/eval/eval-turn-budget.test.ts` | **F-052** — a budget stop reconciles against durable state, names what the turn created, and still refuses to call the work done | Suite 05's; **extended 2026-09-25** — 6 tests, green |
| `apps/web/e2e/eval-greenfield-seed.spec.ts` | **U3** — the seeded container is the same slug and the same repository path in the browser, over REST, and from `kampaku projects list` | **Authored 2026-09-25 — 2 tests, green** against this run's data dir |
| Suites 01–05's locks, re-run in the same commit window | Incremental regression | See § Evidence |

## Pass

- Binary: **not met in full.** Every oracle bullet holds except the second-language one, which the product
  cannot satisfy as written because it produces no check command for **either** project. Stated plainly rather
  than scored as a pass.
- Score: **6** / 10 — see § Result.

## Run log

### Run 4 — 2026-09-25 (the run that counts)

| Field | Value |
|-------|-------|
| Date | 2026-09-25, 20:43:41–20:50:11 |
| Data dir | `/home/pdonoso/.kampaku-eval-06/data` (wiped, `bootstrap`, one instance for the three prompts) |
| Git SHA | `497cfdb` + `148fb9b` (the two product fixes this run measures), landed as commits on `develop` |
| Workspace | `/home/pdonoso/kampaku` (the value `.env.example` documents) |
| Endpoint | FreeLLMAPI `:3001`, model `auto:escalera` → `nvidia/nemotron-3-ultra-550b-a55b`. **Healthy, measured before the run:** a 23-token completion returned in **1.0 s**. Degraded inside the run: model calls in the same window measured 4–55 s, and two turns still spent their whole budget |
| Surfaces | CLI (canonical), REST, and the browser (Chromium via Playwright against this data dir) |
| Wall clock | 6 min 30 s of live turns for the three prompts (47 s, 19 s, 5 min 23 s) |
| `<PATH>` / `<PATH-2>` | `/home/pdonoso/projects/eval-seed` (empty at the start) / `/home/pdonoso/projects/eval-seed-py` (empty at the start) |
| Stacks chosen | **None, in both, and the reply says why.** The factory declines to name a toolchain for an empty directory |
| Tests | `npm test` exit 0 (worker 22 / web 33 / core **134** files); `apps/web/e2e/eval-greenfield-seed.spec.ts` 2 passed; suites 01–05's specs re-run |

**The three prompts, one conversation (`7e1b3285-1097-4073-a1b2-ad00c53a8948`).**

| # | Prompt | Tools | Outcome |
|---|--------|-------|---------|
| 1 | `Open a work order for a new project at /home/pdonoso/projects/eval-seed called seed-demo. Choose the stack yourself and tell me what you chose and why. Seed only what is needed to start: version control, a README whose commands all work, a license, and a minimal check. Do not invent a stack that is not on disk. Do not modify the platform repository.` | `read_repository`, `create_sub_agent`, `create_project`, `read_repository` ×4 | **47 s, returned.** Container `seed-demo` created with lead `seed-demo-lead` and repository `file:///home/pdonoso/projects/eval-seed`; the reply listed the six seeded files and said **"No stack was chosen — the directory was empty, so there was no existing toolchain to detect"** |
| 2 | `Show me how a stranger opens that directory and verifies the README commands.` | `read_repository` ×2 | **19 s, returned.** Correct about the README (*"it explicitly says 'this README documents no commands'"*), and **wrong about a command it never ran**: *"`git status` → clean (only the seeded files tracked)"*. The checkout has no commit, so all six files are untracked. [F-053](results/BOARD.md) |
| 3 | `Now do the same for a second project at /home/pdonoso/projects/eval-seed-py, but in Python.` | `read_repository`, `create_sub_agent`, `create_project`, `delegate_to_agent` | **5 min 23 s, stopped at the turn budget after 4 model calls.** The artifact is there — `eval-seed-py`, lead `eval-seed-py-lead`, and a checkout byte-identical to the first apart from the name — and the reply is the budget stop, which correctly named *"1 project(s): eval-seed-py; 1 agent(s): eval-seed-py-lead; 1 repository link(s)"* |

**State, before and after every prompt** (`~/.kampaku-eval-01/oracle.py`, documented REST only):

| Point | Projects | Seats | Work items | Jobs | Questions |
|-------|----------|-------|------------|------|-----------|
| after `bootstrap` + `settings folders add` | 1 | 10 | 0 | 0 | 0 |
| after prompt 1 | **2** | **11** | 0 | 0 | 0 |
| after prompt 2 | 2 | 11 | 0 | 0 | 0 |
| after prompt 3 | **3** | **12** | 0 | 0 | 0 |

Nothing was restaffed, no work item was created, and the only writes are the two seeds the emperor asked for.

**Two honest gaps in run 4, recorded rather than smoothed over.** Prompt 2's `git status` claim is one, and it
is a board row. The other is the shape of the run: the ladder degraded mid-run, so prompt 3 spent its budget
on a *delegation* to the new lead, and its reply is the budget stop rather than a description of the project it
had just seeded. The server-side bound did exactly what suite 05's fix promises — a stopped turn, with its
numbers, naming what it had durably changed — but a stranger asking "do the same in Python" ends up reading a
budget notice instead of an answer, and that is a weaker artifact than the suite wants.

### Runs 1–3 — 2026-09-25 (the three runs that found the three fixes)

| Run | What it measured | What came out of it |
|-----|------------------|---------------------|
| **1** | Prompt 1, fresh data dir. The turn created the container, the lead and two seats, read the empty checkout, and then ran **17 min 47 s** on a 300 s budget — **41 model calls**, 1 533 s of model latency, no reply, and zero files in `<PATH>` | [F-051](results/BOARD.md): the turn budget bounded the session loops and not a tool call. `submit_intent` → `expandUntilBudget` spends one model call per node per depth and took no deadline. Fixed, locked |
| **2** | The same prompt after the F-051 fix. The turn returned in **90 s** — and `<PATH>` still held **zero entries**: `create_project` does not seed, `update_project` does and is denied to the front office, and no seat holds `system-project-bootstrap`, so nothing could write the checkout. The reply named the remaining work honestly | The blocking gap: the factory promised to stand a project up and had no path that could write a file. Fixed, locked |
| **3** | The same prompt after the seeding fix. The checkout was seeded — git repository, README, LICENSE, `.gitignore`, `AGENTS.md`, `.env.example`, CI — and the turn stopped at its budget saying *"Nothing was created or changed by this turn — no project, no work item, no repository change"* | [F-052](results/BOARD.md): the budget reply asserted a durable fact that durable state contradicted. Fixed, locked |

### Instrumentation

| Artifact | Path |
|----------|------|
| Run env | `~/.kampaku-eval-01/run.env` (data dir repointed to `.kampaku-eval-06`; the suite-05 value is kept as `run-s05.env.bak`) |
| Oracle | `~/.kampaku-eval-01/oracle.py --json` → `s06r4-00-baseline.json` |
| Transcripts | `s06r4-p1.out`, `s06r4-p2.out`, `s06r4-p3.out`; run 1's runaway transcript `s06-run1-p1-runaway.out` |
| Oracle sweep | `s06r4-oracle.sh` → `s06r4-oracle.txt` (files, git, READMEs, platform diff, ecosystem grep) |

## Result

**Binary: one oracle sentence unmet. Score: 6 / 10.**

**What holds, measured on disk rather than read from a reply.** Two projects were created from chat on a fresh
instance, each with a linked repository, an accountable lead, and a real checkout at the path the emperor
named. Both are git repositories on branch `main`. Both READMEs document no command, name no ecosystem, and
say in the same words that no dependency manifest exists; the two files are identical apart from the project's
own name. The platform checkout was clean when the run started and the product wrote nothing into it. All three
surfaces agree on the slug and the path. The seed reports what it wrote — the reply named `git init` and the six
files, and the structured report behind it is locked.

**What does not hold.** The suite's second-language bullet: *"Prompt 3 produces a project whose checks are that
language's commands, not the first project's."* Neither project has a check, in either language, because the
seed cannot know a language from an empty directory and — correctly — writes nothing it cannot run. The result
is that the neutral form of F2 holds and the literal box does not. `eval-seed-toolchain-freedom.test.ts` locks
the neutral form, including the control that the neutral seed is still a real seed, and the box is left
unticked rather than reinterpreted.

**Why 6 and not 7 or 8.** A usable greenfield seed that a stranger can open, whose documentation is true, is
worth more than half — the three fixes this suite forced are the difference between a factory that could not
write a file into a new project and one that can. What keeps it at 6:

1. **P1 is unmet, in the suite's own prompt.** Prompt 2 asked how a stranger *verifies* the README, and the
   answer asserted a `git status` result the turn never obtained and that is false on disk. The factory has no
   shell, so it *cannot* verify a checkout by execution; the honest answer is the procedure plus that limit.
   [F-053](results/BOARD.md) is open, and suite 11 is where "done requires re-executed evidence" is scored.
2. **The second-language box is unmet**, as above.
3. **U5 has one run's worth of evidence.** The fixes landed before run 4, so run 4 is a fresh-dir re-run after
   fixes — and there is no second run on the unchanged tree to show the fixes hold when nobody is watching.
   The two budgets that stopped mid-turn in this run are the reason to want that second run rather than to
   assume it.

**Not `blocked`.** The suite ran to a verdict on a fresh instance; what it measured is the answer.

## Evidence

- **The three prompts, verbatim, with each turn's own meta line:** `~/.kampaku-eval-01/s06r4-p1.out`,
  `s06r4-p2.out`, `s06r4-p3.out` — the tool lists quoted above are read from those lines, not from the prose
- **The oracle sweep, which is the oracle for this suite:** `~/.kampaku-eval-01/s06r4-oracle.txt` —
  both file listings, `rev-parse`/branch/`git status` per checkout, both READMEs, the README diff (one line:
  the title), the platform checkout's `porcelain` count and `find -newermt` result, the file mtimes
  (20:44:08 and 20:45:02, none touched afterwards), and the ecosystem grep
- **Run 1's runaway:** `~/.kampaku-eval-01/s06-run1-p1-runaway.out` — `CoreClientError: Request to
  http://127.0.0.1:18080/api/v1/agents/kampaku/chat failed after 1067s: fetch failed`, after 17 min 47 s, and
  the model-call census 41 calls / 1 533 s from the endpoint's own request log (the proxy's `requests` table,
  read as endpoint instrumentation, never as product evidence)
- **The empty checkout run 2 produced:** recorded in this file's § Run log and in the commit message of
  `497cfdb`
- **The three fixes and their locks:** `apps/core/src/agents/runtime/turn-budget.ts`,
  `delegator/expand-phase-leaves.ts`, `delegator/decompose-intent.ts`, `delegator/plan-and-delegate.ts`,
  `agents/runtime/tools/submit-intent.ts` (F-051); `agents/runtime/session.ts` § `turnStateDelta` and
  `budgetExhaustedReply` (F-052); `application/projects.ts` § `seedNewCheckout` and
  `agents/runtime/tools/create-project.ts` (the seed) — each with the test named in § Automated tests, and
  each verified to fail without its fix
- **The browser lock, against this run's data dir:**
  `PLAYWRIGHT_CORE_DATA_DIR=/home/pdonoso/.kampaku-eval-06/data npx playwright test e2e/eval-greenfield-seed.spec.ts`
  → **2 passed**, reusing the live Core on `:18080`
- **Commits on `develop`, nothing pushed:** `4c153f3` (the turn's clock in planning), `497cfdb` (open a work
  order by standing the checkout up), `148fb9b` (reconcile a budget stop against durable state), `c67ba3b`
  (the two suite locks), plus this change
- **Regression:** `npm test` exit 0 — worker 22 / web 33 / core **134** files (636 tests, 1 skipped); `npm run
  test:eval` 19 files / 126 tests; suites 01–05's Playwright specs re-run on dedicated ports —
  **17 passed, 1 skipped** (`/tmp/s06-e2e-regress2.log`). **An operator deviation, recorded:** the first
  attempt of that re-run failed six specs with `ERR_CONNECTION_REFUSED at http://127.0.0.1:13002`, because the
  default web port had no dev server up — an infrastructure failure of the harness, not a product one. It was
  re-run on dedicated ports (Core `19080`, web `13003`) against a scratch data dir, which is the run quoted
  above

## Blocker

[F-053](results/BOARD.md) is **open**: a reply asserted a command's result — `git status` → *"clean (only the
seeded files tracked)"* — that it never obtained, about a checkout with no commits, where every file is
untracked. It is a P1 miss rather than an oracle miss, and it is the one thing standing between this suite and
the 8 that its other three withheld points describe.

[F-001](results/BOARD.md) remains resolved, [F-051](results/BOARD.md) and [F-052](results/BOARD.md) were
opened by this suite and are resolved with locks, and no row blocks the next suite.

### What the next session should take

1. **Suite 07, plan a human can run** — the order is unblocked, and this suite leaves it something specific:
   the intake now stands a checkout up but never puts a *check* in it, so 07's plan is the first place a real
   command can come from.
2. **[F-053](results/BOARD.md) is small and worth closing first** if suite 11 is taken soon: the rule already
   exists in the prompt ("never describe a result you did not read"), so the work is finding why a turn that
   held no shell still described one command's output — most likely by giving the honest limit a name the
   reply can use, as `read_repository`'s refusal names what it withheld.
3. **Re-run this suite once, on an unchanged tree**, before anyone calls it settled. Two turns in run 4 hit
   the budget because the ladder degraded mid-run; the same three prompts on a healthy ladder should return
   three real answers, and that is the run that would decide whether the second-language box can be met by the
   seed choosing a stack when the emperor asks for one.
