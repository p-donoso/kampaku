# 18 — Language-agnostic

## Promise tested

The factory works in any language and any toolchain, including several in one project, and it derives
its acceptance evidence from what the project actually uses.

This suite is the executable form of invariant §1
([agnosticism invariants](../concepts/agnosticism-invariants.md)). It replaces the retired
"any domain" suite: the same class of claim (the factory has no baked favourite), narrowed to the
axis the product actually promises. The software-only scope itself is gate **F1**, scored by
[04](04-capability-boundary.md).

## Why it elevates

Weak: every plan's checks are `npm test`; a Python project's plan documents `npm install`; a Rust
project is staffed with a `frontend` specialist; "the project has no tests" is said about a project
with a `Makefile` target; a polyglot repository is treated as one language.

Credible: the factory reads the manifests, lockfiles, CI configuration, and existing test conventions,
names what it found, and uses it. Adding a language is data, not a new code path.

## Prereqs

- Suite [11](11-honest-done.md) green (the evidence machinery works).
- **Three** scenario repositories prepared outside the platform, of which at least two are not the
  platform's own language:
  - **A** — a non-Node, single-language project with an existing test runner (for example a Rust crate,
    a Go module, or a Python package with tests).
  - **B** — a project with **no** discoverable check and no stated check in the intent.
  - **C** — a **polyglot** repository: at least two languages with different toolchains.
- Record each path and the toolchain you expect the factory to discover.

## Emperor prompts

For each scenario, one order:

1. **A**: `Open a work order for the project at <A>. Plan and implement a small change, and include the checks you will use. Tell me which files told you the toolchain.`
2. **B**: `Open a work order for the project at <B> and plan a small change.`
3. **C**: `Open a work order for the project at <C> and plan a small change that touches both the <lang-1> and <lang-2> parts. Tell me which checks apply to which part.`
4. Cross-check: `Compare the three plans. Did you use the same check commands for all three? If so, explain why that is correct.`

## Oracle

- **Discovery before assertion.** For each scenario the factory names the evidence it used (a manifest,
  a lockfile, a CI workflow, a build file, a shebang, an existing test directory) and its answer is
  consistent with that evidence.
- **A**: the plan's checks are A's own commands, executed successfully by the operator. No
  package-manager command from another ecosystem appears.
- **B**: the factory asks for the missing check rather than inventing one. An invented `npm test`, an
  invented `pytest`, or any other default fails this suite. The question names what it looked for and
  did not find.
- **C**: the plan distinguishes the checks per part of the repository. A single check command for the
  whole polyglot repository fails unless the repository genuinely has one (for example a single
  `make check`), in which case that fact must come from the repository.
- **No ecosystem default anywhere.** Across the three plans, no command appears that is not traceable
  to a file in the corresponding repository.
- Role vocabulary follows the aspects present, not a web-app default (cross-check with
  [03](03-stations-and-staffing.md)).
- Seeded artifacts, if any, are in the project's own language and their README documents only commands
  that run.
- Prompt 4 produces a correct explanation: the checks differ because the projects differ. If the reply
  claims uniformity is correct, that is a failure.

## How to measure

- Execute every check command in every plan; record exit codes.
- For each command, locate the file or convention that justifies it; a command with no source is a
  finding.
- Check the plans and staffing for the string `npm`, `yarn`, `pnpm` outside a Node scenario.
- Confirm scenario B produced a durable question.
- Verify no scenario wrote into the platform checkout.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — `s18r2`, its own data dir and ports (`28000`/`28001`), a fresh `bootstrap`
- [x] U2 Public docs sufficient — the three prompts were driven from this file alone
- [x] U3 Plans/checks visible identically on chat, CLI, and web — `GET /api/v1/projects/eval-seed-polyglot`
      (the read the web UI renders) and `kampaku projects show eval-seed-polyglot` return the same three ids,
      the same owners and the same AC text, and the chat turn's table quoted them from that state
- [x] U4 Automated tests cited below are green — core `990 passed | 1 skipped` (180 files), worker 135, web 93
- [x] U5 Fresh data-dir re-run after any fix — `s18a1` measured the defects, `s18r2` re-measured on a new dir
- [x] U6 No silent budget failure hiding the oracle — no turn ended on its budget; the two refusals are named
      in the record (`check_untraceable`, 6 findings) rather than swallowed
- [x] U7 Pass criteria stay product-level — the oracle is a plan's checks traceable to the checkout
- [x] U8 No open blocking BOARD row for this suite — `suite-loop.py blockers --suite 18`: *no open rows*
- [x] F1 All three deliverables are software — a Python package, a Python stub project, a Rust+Python repository
- [x] **F2 Satisfied by construction — this suite is F2's oracle**
- [x] F3 Each plan respects the repository's existing package boundaries — A's plan stayed inside `src/textstats`
      and `tests/`; C's plan put each function in its own part and crossed nothing
- [x] F4 No existing convention overwritten in any scenario — no manifest, CI, runner or packaging file was
      invented in any of the three; the `README.md` that C's plan touches already stated its own commands
- [x] F5 Every documented command run successfully — executed here, exit 0: `make check` (14 tests),
      `cargo test --manifest-path engine/Cargo.toml`, `python3 -m unittest discover -s pycal/tests`

### Suite-specific

- [x] Toolchain discovery named and consistent per scenario — A: `Makefile` (target `check`), `pyproject.toml`,
      `AGENTS.md`, `tests/test_words.py`, `README.md` → `make check`. B: **nothing**, stated as nothing. C:
      `engine/Cargo.toml` + crate tests for the Rust part, `README.md`'s documentation command for the Python part
- [x] No cross-ecosystem command in any plan — the string `npm` appears in **no** plan, no AC, no leaf and no
      gate on `s18r2`; the same scan on `s18a1` found it in the phase-auditor gate's AC, which is
      [F-003](results/BOARD.md)'s sixth instance and is fixed
- [x] Undiscoverable check produced a question, not a default — `s18r2`: apply refused with 6
      `check_untraceable` findings, 0 work items persisted, and gate `1d25e143` asks *"Which command proves the
      change?"* with the absence list in its context
- [x] Polyglot repository differentiated per part — three items, three commands, each naming its working
      directory: `cargo test` / `cargo build` from `engine/`, discovery from the root; the phase's own criteria
      say *"each green under its own runner"* and no combined command is claimed
- [x] Role vocabulary follows the aspects present — nothing web-shaped was staffed for a crate or a stdlib
      package; the single-seat staffing was **declared** as a capability gap with the reason (catalogue has no
      Rust/Python station — [F-136](results/BOARD.md)) instead of being dressed as coverage
- [x] Zero platform writes — `git status --porcelain` on the platform tree: 0 lines, before and after

### In-scope P-gates

- **P3** required for scenario B · **P6** required · **P7** required

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-language-agnostic.test.ts` | The three scenarios end to end: A's discovery names `make check` and its command **executes green**; B's invented command is refused and the question names what was looked for; C's two parts carry their own commands and **both execute green**; and F-087's routing rule | **Authored** (4 cases; scenario A's assertion verified red against the pre-fix router, B and C red without `check-validation.ts`) |
| `apps/core/tests/delegator/check-validation.test.ts` | The plan/checkout traceability rule itself: root declaration, subdirectory declaration (polyglot), documented command, and refusal — plus the honest silence when the checkout cannot be read | **Authored** (6 cases; 2 red with the fix reverted) |
| `apps/core/tests/pm/phase-auditor-toolchain.test.ts` | The phase gate's check criterion comes from the checkout, and its seat comes from the project | **Authored** (4 cases; 3 of 4 red with the fix reverted) |
| `apps/core/tests/pm/criterion-checks.test.ts` | F-087: a path-existence criterion is routed by its verb, with the UI, document and behaviour controls beside it | **Extended** (the F-087 case verified red with the fix reverted) |
| `apps/core/tests/eval/eval-seed-toolchain-freedom.test.ts` | Seeds in two languages produce their own commands | Exists (shared with [06](06-greenfield-stranger-repo.md)) |
| Skill-assignment coverage tests | Specialists for non-web aspects receive skills | Exist in part. The **catalog** itself still has no data, IaC, mobile, embedded, Rust or compatibility station — that is [BOARD F-136](results/BOARD.md), recorded and deliberately **not** part of this suite's oracle |
| `apps/worker/tests/project-toolchain.test.ts` | Discovery from repository markers; per-toolchain command resolution; fail-closed refusal with the markers it looked for; nested-package reporting; non-Node criteria producing a required check | Exists |
| `apps/core/tests/application/scaffold-toolchain-neutrality.test.ts` | The seed and fallback plan leaves name no ecosystem | Exists |

## Pass

- Binary: all oracle bullets hold for all three scenarios.
- Score: **10** / 10.

## Run log

### Run 1 — `s18a1` (measured the defects)

| Field | Value |
|-------|-------|
| Date | 2026-11-05 |
| Data dir | `.kampaku/runs/s18a1/data` (ports 28000/28001) |
| Git SHA | `98baaac` on `develop`, platform tree clean |
| Scenario A / B / C paths | `/home/pdonoso/projects/eval-seed-py` (A); `eval-seed-other` (B); `eval-seed-polyglot` (C) |
| Languages | Python 3.14 stdlib `unittest` under a `Makefile`; Python stub with no runner; Rust 1.93 (`cargo`) + Python |
| Model / provider | `deepseek-flash` over FreeLLMAPI (`http://127.0.0.1:3001/v1`) |
| Verdict | **did not pass** — scenario B was answered with an invented command |

**A — passed.** The plan named five files (`Makefile`, `pyproject.toml`, `AGENTS.md`, `tests/test_words.py`,
`README.md`), named exactly one check (`make check`), added one test to `tests/test_words.py` (job `9eb9e4d3`,
`233 → 339` bytes, no other product path), and `make check` exited 0 with both tests listed. No `npm` anywhere.

**B — failed, and that is what the suite runs for.** Asked to plan a change in a checkout with **no**
discoverable check, the front office said the truth out loud — *"this repository declares **no check today**"* —
and then applied a plan whose every leaf required `python3 -m unittest discover -s tests -v`, a command for a
checkout with no `tests/` directory. The words were honest; the record was not, and nothing in the product had
read the checkout to contradict it.

**C — passed.** Per-part checks: `cargo test --manifest-path engine/Cargo.toml` for the crate,
`PYTHONPATH=pycal python3 -m unittest discover -s pycal/tests` for the package, nothing combined.

**Prompt 4 — passed, and it found two defects nobody asked it about:** the cross-check read
*"Audit phase — extend-words-test-coverage"* back with the AC *"npm test passes when package.json defines a test
script"* and with `kampaku-auditor` — a platform station — as its owner, and reported both as defects.

### Run 2 — `s18r2` (re-measured on a fresh data dir, after the fix)

| Field | Value |
|-------|-------|
| Date | 2026-11-05 |
| Data dir | `.kampaku/runs/s18r2/data` (ports 28000/28001; the stack was restarted onto the same data dir after a host restart, `suite-loop.py up`) |
| Git SHA | `98baaac` + the fix commit on `develop`, rebuilt (`npm run build`) before the run |
| Scenario A / B / C paths | `/home/pdonoso/projects/eval-seed-py`; `/home/pdonoso/kampaku-projects/eval-seed-other`; `/home/pdonoso/kampaku-projects/eval-seed-polyglot` |
| Model / provider | `deepseek-flash` over FreeLLMAPI |
| Verdict | **pass** — all four prompts, three scenarios, 10/10 |

**A.** Four items, every criterion naming the checkout's own check (`make check`, twice quoting `AGENTS.md`'s
"only required check"), one leaf executed through a job (`75203fc6`) whose 14 tests ran green from the operator's
own shell afterwards (`make check` → `Ran 14 tests … OK`). Discovery named `Makefile`, `AGENTS.md`,
`pyproject.toml`, `tests/test_words.py`, `README.md` and the *absence* of `requirements.txt`, a lockfile, CI,
tox/nox and `setup.cfg`.

**B.** The apply was **refused**: *"6 `check_untraceable` findings … Nothing was persisted"*, `GET
/api/v1/projects/eval-seed-other` shows **0 work items**, and gate `1d25e143-2d08-4ca4-aefd-1a881727132b` asks
*"This checkout declares no toolchain at all, so the apply gate refused my plan. Which command proves the
change?"* with four options and the list of what was looked for in its context. That is the oracle bullet: an
invented check was refused, and the emperor was asked.

**C.** Three items, each with its own command and working directory, `[dependencies]` frozen empty, and the
missing root declaration stated rather than invented.

**Prompt 4.** *"No — not the same commands"*, then a per-project table that derives each divergence from the
checkout (`make check` because a `Makefile` exists; `cargo test`/`cargo build` for the crate and discovery for
the package because there is no root runner; nothing at all for `eval-seed-other` because its apply was
refused), and it names the two open decisions in the instance. It does **not** claim uniformity is correct.

### Decisions taken on the emperor's behalf

Every gate on both runs was answered with the product's first/recommended option (`gates auto`), and each answer
is recorded in `<run>/logs/gates-answered.md`:

- `s18a1`: `90c7d57a` (park the reported gaps as approvable scope expansions), `61200ce9`, `46a84602`,
  `13db067a`, `30a69804`, `5443620a` (each AC "met", on the lead's own reads); `1a1b4e7e` (put the B checkout
  under the granted folder, `/home/pdonoso/kampaku-projects/eval-seed-other` — the product refused to link
  outside its grant and asked; the operator copied the checkout there).
- `s18r2`: `91c348c1` (clear the three AC gates on A's executed leaf), `3c387a35`, `23add3ef`, `3c06096d`.
- Left **pending** deliberately, because they are walls and not loop decisions: `1d25e143` (which command proves
  B's change) and `991cf73f` (whether to author Rust/Python capabilities plus a separate auditor before
  releasing C's execution).

### What is still open

| Row | Why it does not stop this suite |
|-----|--------------------------------|
| [F-136](results/BOARD.md) | discovery not persisted; catalogue has no Rust/Python station. The suite's role bullet is about **not** using a web default, and none was used — the gap was declared |
| [F-088](results/BOARD.md) | A's phase item read `blocked` while its leaf's job succeeded and `make check` was green — measured again on `s18r2` (item `0dc02331`, triage `2e74885d`) |
| [F-106](results/BOARD.md) | the blocker A's lead filed escalated back to itself — measured again on `s18r2` (blocker `210247d9`) |
| [F-108](results/BOARD.md) | A's remaining leaves wait on an operator release rather than on work |

## Result

**Pass — 10/10.** Binary: every oracle bullet holds for all three scenarios on `s18r2`, a fresh data dir, with
the fix built before the run. Score: 10, because the promise is locked by automated tests cited above and each
lock was verified red with its fix reverted.

## Evidence

- Run 1 transcript: `.kampaku/runs/s18a1/logs/{a1,b1,b2,c1,p4-cross}.out` + `a1-plan-watch.log`;
  gates in `gates-answered.md`; oracle `s18a1-after-manifest.txt`.
- Run 2 transcript: `.kampaku/runs/s18r2/logs/{a1,b1,c1,p4-cross}.out`; gates in `gates-answered.md`.
- Fixture A after the run: `git -C /home/pdonoso/projects/eval-seed-py diff --stat` → `src/textstats/words.py`,
  `tests/test_words.py`; `make check` → `Ran 14 tests … OK`.
- Fixture B: `GET /api/v1/projects/eval-seed-other` → `workItems: []`; the refusal names six findings.
- Fixture C: `kampaku projects show eval-seed-polyglot` and `GET /api/v1/projects/eval-seed-polyglot` agree on
  three items, their owners and their AC; `cargo test --manifest-path engine/Cargo.toml` and
  `PYTHONPATH=pycal python3 -m unittest discover -s pycal/tests` both exit 0.
- Platform tree unchanged by any scenario: `git status --porcelain` → 0 lines.
- Regression: `apps/core` 990 passed / 1 skipped (180 files), `apps/worker` 135, `apps/web` 93.

## Blocker

None. [F-003](results/BOARD.md) and [F-087](results/BOARD.md) were the two rows this suite named, and both are
resolved in this change with locks verified red. The two parts of F-003 that survive — discovery not persisted,
catalogue breadth — are [F-136](results/BOARD.md) and do not block this oracle, for the reason stated in that
row. [BOARD F-001](results/BOARD.md) stays resolved: the agent path can open a container.
