# 01 — Work-order intake

## Promise tested

A stranger can bring the factory up from the public docs, ask what exists, and open a work order —
and the container that the order lives in is reachable and consistent on every surface.

> **Run 4: binary fail, fourth time.** Intake works and the container is **owned** — stable across
> runs 3 and 4 ([BOARD F-005](../results/BOARD.md) closed by observation). The first bullet has now failed
> four times in four shapes, including once after 30.2% of the turn was removed, so the next fix is a
> change of mechanism rather than another prompt edit: [BOARD F-024](../results/BOARD.md) now carries the
> recommendation to make the common reads deterministic flows. Run parameters, all four runs, and the
> full finding ledger are in the [baseline run record](../baseline-20260924.md).

## Why it elevates

Weak: the README lies; an "inspect" request mutates state; the factory cannot accept work at all
because the front desk has no way to open a container; a container exists in the database but not on
disk, or exists on disk but is invisible to the UI.

Credible: the documented boot works; inspection is read-only and truthful; a work order opens from
chat, CLI, and REST with the same slug and id; the linked repository path exists on disk and is
outside the platform.

This is the factory's front door. Everything downstream depends on it, which is why it is suite 01.

## Why the intake path is the hard part

Three separate failures are frequently confused, and this suite separates them:

1. **The container is not created** — no project record, so nothing can be scoped.
2. **The container is created with a link that is not real** — a `file://` path that does not exist,
   or a path inside the platform workspace, stored and reported as linked.
3. **The container is created but only on one surface** — the agent path is refused while REST
   works, so an operator driving chat cannot accept work.

## Prereqs

- Follow [00-protocol.md](../00-protocol.md) to an empty data dir and a running stack.
- Prepare an empty directory **outside** the platform checkout (for example
  `/home/pdonoso/projects/eval-intake`). Record it as `<PATH>`.
- No prior suites.

## Emperor prompts

1. `Are we ready? What exists here — projects, teams, open work? Do not change anything.`
2. `Something is missing for a first run; tell me what I must decide. Do not create it yet.`
3. `Open a work order for a small service called intake-demo. Its repository lives at <PATH>. Do not start any work yet — I only want the container and the owner.`
4. `Show me the container from the command line and confirm its id, owner, and repository path.`

## Oracle

**Inspection (prompt 1–2)**

- The public start path from the root README succeeded, or the failure is recorded as a product gap.
- Health/status is reachable.
- The reply describes reality: either a default project and team, or an explicit empty state plus a
  clear ask — never fiction.
- After prompts 1 and 2, no project, agent, work item, or repository file appeared that the emperor
  did not request.
- If prompt 2 produces a question, it is visible in the CLI **and** answerable in the UI.

**Intake (prompt 3–4)**

- A project container exists with a stable slug/id, discoverable from chat, CLI, and REST.
- Its linked repository path is `<PATH>`, and `<PATH>` exists as a directory on disk.
- The path is **outside** the platform workspace.
- An accountable owner (project lead) is recorded on the container, and the slug/id agrees with the
  agent that was named as owner.
- Zero work items and zero jobs were created by opening the order.
- The platform checkout's `git status --porcelain` is unchanged by the intake.
- Chat, CLI, and web agree on the project slug/id, the owner slug, and the repository path string.

## How to measure

- Run the README start commands; note any failure.
- Snapshot counts (projects, agents, work items) via public CLI before and after each prompt.
- Read the container back from all three surfaces **including the id and the repository path string**,
  not HTTP status alone.
- `test -d <PATH>` and `git -C <PATH> rev-parse` (expect: directory exists; not a repository yet is
  acceptable, and must be reported as such).
- `git -C <platform checkout> status --porcelain` before and after intake.

## 10/10 checklist

Universal gates ([README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three
surfaces · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog
capture · **U8** BOARD clean.

Factory gates: **F1** software scope · **F2** stack neutrality · **F3** architecture neutrality ·
**F4** brownfield respect · **F5** shippable.

Marked against **run 11** (`s01r11`, 2026-10-20), the latest measurement, on a fresh data dir with every fix
in the tree before the stack came up. All gates hold, which is what the suite requires to reach 10. Run 10
(`s01r10`, 2026-10-06) is the run that first carried them, and run 11 is the one that checks they survived the
work of suites 03–07 landing on the same tree.

- [x] U1 Empty instance — fresh data dir (`.kampaku/runs/s01r10/data`), the fixture deleted and recreated
  empty by hand, and nothing driven through the instance before prompt 1
- [x] U2 Public docs sufficient — `bootstrap` then the start command from the documented config, and run 10
  is the run that proves the README names the step: `start.sh` printed *"no default project … Run: …/kampaku
  bootstrap"* on the fresh data dir and the operator ran exactly that
- [x] U3 Chat + CLI + web agree on ids/fields — **all four surfaces driven, live.** Chat by the four turns,
  the CLI spawned against the same Core, REST by direct read, and the **web UI rendered and read off the DOM**
  by `logs/s01r8-web-readback.json` (Metadata card: Slug, **Id**, Lead, Repository as the stored url). All four
  agree on slug `intake-demo`, id `5fd4d69d-…`, owner slug `intake-demo-lead` and the repository string
- [x] U4 Automated tests cited below are green — both locks the table names are authored and pass:
  `tests/eval` **30 files / 222 tests**, and the web spec **6 passed (18.5 s)**
- [x] U5 Fresh data-dir re-run after any fix — run 10 is exactly that, taken with all four fixes in the tree;
  run 9 was invalidated on purpose because a fix landed during it (`mixed-commit`)
- [x] U6 No silent budget failure hiding the oracle — no budget was hit; every turn reported its model and tools
- [x] U7 Pass criteria stay product-level — every verdict is an observable fact
- [x] U8 No open blocking BOARD row for this suite — F-024, F-027 and F-030 are closed by run 7. F-031,
  F-033, F-034, F-035 and F-036 are open and none of them is a bullet of this suite's oracle
- [x] F1 Oracle concerns a software deliverable
- [x] F2 No stack assumption in the oracle
- [x] F3 No imposed repository shape
- [x] F4 N/A or existing conventions respected
- [ ] F5 Shippability path named — not required until suite 23

### Suite-specific (all must be yes for 10)

- [x] Inspection does not mutate projects, agents, or work items
- [x] A work order opens from **chat** (the agent path), not only CLI/REST
- [x] The linked repository path exists on disk and is outside the platform workspace
- [x] An accountable owner is recorded on the container — **first pass, run 3**
- [x] Intake creates zero work items and zero jobs
- [x] The platform checkout is unchanged by intake

### In-scope P-gates

- **P7 Work-order intake** — required
- Soft **P3** when prompt 2 asks a question

### When this suite stops being a product gap

Stated before it is needed, so that "still failing" does not become the default state forever.

Four runs have failed the inspection bullet with a 14B local model, and the fourth failure survived a
30.2% cut to the turn. The next attempts are capability work, not wording: the fields were never on the
agent path at all, and the first fix is landed
(`get_project` now returns the container's id, lead slug and repository urls).

**The criterion.** If a run after those capabilities land still fails prompt 1 or prompt 4, the finding
stops being recorded as a product defect to be fixed and is recorded as a **capability gap of the
endpoint**, the way [F-008](../results/BOARD.md) records model-level failures. Concretely:

1. The oracle bullet that fails is marked **`not met — endpoint capability`**, with the model, the
   endpoint and the run cited.
2. [F-024](../results/BOARD.md) / [F-030](../results/BOARD.md) close as *product work complete, endpoint
   unresolved*, rather than staying `open` indefinitely.
3. The suite's score reflects it. A suite cannot be 10 while a bullet is unmet, so the suite stays
   below 10 and **says why** — which is the honest outcome, and better than a row that is reopened every
   few weeks with a new prompt tweak.

The condition to reach for that criterion is narrow on purpose: it applies after the read capability
exists and has been measured, not instead of building it. A model that cannot route a question to data
it was handed is an endpoint finding; a model that was never handed the data is ours.

Deterministic locks for the capability work:
`apps/core/tests/agents/get-project-identity.test.ts` (the container's identity is readable),
`apps/core/tests/eval/eval-orchestrator-contract.test.ts` (the allowlist),
`apps/core/tests/agents/create-project.test.ts` (ownership at creation),
`apps/core/tests/agents/orchestrator-skill-scope.test.ts` (what the prompt may carry).

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-orchestrator-contract.test.ts` | Front-office allowlist **including** `create_project` | **Must be rewritten** per ADR-0005; currently asserts the opposite |
| `apps/core/tests/agents/create-project.test.ts` | Container creation, workspace refusal, corrective refusals | Exists |
| `apps/core/tests/application/repository-policy.test.ts` | Repository validation at the shared entry points | Exists |
| `apps/core/tests/eval/eval-work-order-intake.test.ts` | Intake from chat creates a container whose repository path exists and is outside the workspace; zero work items; **and the container's id, owner slug and repository string are the same on the non-chat surfaces** | **Extended for F-109** — 5 tests. Drives `runKampakuChat` with a broker that emits `create_sub_agent` then `create_project` (the *agent path*), then reads the container back off `projects list`, `projects show` **through commander from source**, the **served** `GET /api/v1/projects/:slug`, and `executeGetProject`. Each of the three field halves verified **red without the fix, in isolation** |
| `apps/web/e2e/eval-work-order-intake.spec.ts` | Container visible in the UI with the same slug, id and repository string, and an owned work order created through REST | **Extended for F-109** — 6 tests, 18.5 s. Drives the web UI, spawns the CLI against the same core, and reads the dialog DOM; the two assertions that used to require the bare path now also require the stored url and the id, so a regression fails here |
| `apps/core/tests/eval/eval-first-run-bootstrap.test.ts` | The documented first run reaches a factory that can accept a turn — or says what it needs (F-110) | **Authored** — 9 tests. A fresh instance served over a real socket, the **CLI spawned as a child process** answering `No project found. Run \`kampaku bootstrap\` first.` and non-zero, then accepting the turn once the project exists; plus the start path held to the notice, `start.sh` held to calling it before the banner, `install.sh` held to a script that exists, and the **control that no start path creates the default project**. 4 of 9 verified **red without the fix** |

Without committed tests, the score is capped at **9**. Listing an existing test is not a substitute
for a test that locks *this* suite's promise.

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.
- Green only at 10 with U1–U8 + F1–F5 + suite-specific + in-scope P-gates + automated tests.

## Run log

Three runs on 2026-09-24, each on a fresh instance against a real endpoint, each after a fix. Only the
newest counts.

| Field | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|-------|-------|-------|-------|-------|-------|
| Time | 17:51 UTC | 18:09 UTC | 19:08–19:34 | 19:45–19:57 | 20:16–20:25 |
| Git SHA | `a5226d6` | `cce70de` | `6b16437` | `4ffe6d2` | `64c7f58` (clean tree, rebuilt `dist`) |
| Data dir | `.kampaku-eval-01/data` (fresh) | wiped, fresh | wiped, fresh | wiped, fresh | wiped, fresh |
| Model | `qwen2.5:14b`, then `qwen2.5:7b-instruct` | `qwen2.5:14b` (the value persisted at bootstrap; see [F-026](../results/BOARD.md)) | `qwen2.5:14b` | `qwen2.5:14b` | `qwen2.5:14b` |
| Endpoint | `http://127.0.0.1:11434/v1` | same | same | same | same |
| `<PATH>` | `.kampaku-eval-01/repos/intake-demo` | same | same | same | same |
| Wall clock | 2 turns, stopped | 4 prompts | 4 prompts, 26 min | 4 prompts, ~12 min | 4 + 1 supplementary, ~9 min |
| Outcome | Blocked at prompt 1 | Intake works; owner and prompt-4 vocabulary fail | **Owner recorded**; prompts 1 and 4 fail | Owner holds; prompt 1 unchanged | **Refusal path verified live**; prompts 1 and 4 fail on **fabricated names** |

Full parameters, environment facts, and the operator-defect ledger: [baseline run
record](../baseline-20260924.md).

## Run log — runs 8, 9 and 10 (2026-10-05/06)

The fifth column of the table above ends at run 5, and runs 6 and 7 are narrated under § Result. These three
are the re-measurements taken after the row work they follow, and **run 10 is the one that counts**.

| Field | Run 8 (`s01r8`) | Run 9 (`s01r9`) | Run 10 (`s01r10`) |
|-------|-----------------|-----------------|-------------------|
| Date / time | 2026-10-05, 01:03–01:07 | 2026-10-06, 10:06–10:09 | 2026-10-06, 10:12–10:15 |
| Git SHA | `559ce1a` + uncommitted row fixes | same tree, first half of the fixes | same tree, **all** the fixes |
| Data dir | `.kampaku/runs/s01r8/data` (fresh) | `.kampaku/runs/s01r9/data` (fresh) | `.kampaku/runs/s01r10/data` (fresh) |
| Ports | 28080 / 28002 | 28000 / 28004 | 28000 / 28004 |
| Model / endpoint | `deepseek-flash` via FreeLLMAPI `http://127.0.0.1:3001/v1`, `/v1/models` in 0.035 s | same | same |
| Fixture | `/home/pdonoso/projects/eval-intake`, empty | same, reset empty | same, reset empty |
| Wall clock | 4 prompts + 1 repeat, ~5 min of turns | 4 prompts, ~2 min of turns | 4 prompts, ~50 s of turns |
| Outcome | **Binary fail.** Intake, owner, path and the zero-work-items bullets hold; the surface bullet fails on two fields | **Binary fail (superseded).** F-109's id/url halves measured live; the run was then invalidated by a mid-run change, and its web bundle was stale | **Binary pass.** Every oracle bullet holds, measured on all four surfaces including the UI |

What each run is for, so the three are not read as three tries at one thing:

- **`s01r8`** drove the four prompts on the unfixed tree and produced the two findings this work is about —
  [F-109](../results/BOARD.md) (a container's `id` is on two surfaces of four, and the repository path is not
  the same string on the two an operator reads without chat) and [F-110](../results/BOARD.md) (the documented
  first run reaches a stack that can accept no turn). It is also the run whose prompt-4 turn answered **in
  Chinese**, which is [F-027](../results/BOARD.md)'s family and this record's first sighting of it since
  F-027 closed — recorded in § Honest gaps below rather than as a row, with the measurement.
- **`s01r9`** measured F-109's first half on a fresh data dir and was then **invalidated on purpose**: a second
  half of the same fix (the owner slug) landed during it, and the protocol marks a mid-run product change
  `mixed-commit`. Its own live reading also caught a second artifact — the running web served a bundle built
  on 2026-10-04, so its UI reading was of the pre-fix UI. Both are recorded because both are the kind of thing
  this lab exists to notice.
- **`s01r10`** is the clean re-measurement: every fix in the tree before `up`, the web rebuilt and restarted
  before the prompts, the fixture reset empty, and the four prompts driven verbatim.

### Run 10, prompt by prompt

| Prompt | Tools called | What the reply did |
|--------|--------------|--------------------|
| 1 `Are we ready? …` | `get_project`, `get_agent_dashboard` | Named the one project, its four repositories as `file://` urls, the full ten-agent tree by slug, `0` work items, `0` blockers, `0` pending questions — and what it could **not** say (it had not read the repositories). Created nothing |
| 2 `Something is missing …` | `get_project` | Named no open gate it could see, then named the structural preconditions as **decisions**: which body of work, whether the container already exists, a repository path that already exists on disk, whether to name a stack, and who leads it. Created nothing |
| 3 `Open a work order … intake-demo …` | `create_sub_agent`, `create_project`, `list_agents` | Created the lead **first** and passed it as `project_lead_slug` in the same `create_project`; reported the seeded files and the declared `make check` as a declaration it had not run; flagged that the recorded repository **role `web`** was a default and not something it had read. Zero work items, nothing delegated |
| 4 `Show me the container … confirm its id, owner, and repository path` | `get_project` ×2 | Both containers with **id, owner slug and repository path**, said plainly that it holds no command tool and so will not print CLI output or invent a `show` subcommand, and named the repository as **the stored link**, not a filesystem read |

The four-surface reading taken after prompt 4 — chat, CLI, REST and the web UI, each read on its own
instrument, for container `intake-demo` (`5fd4d69d-cadd-47a8-b235-db3365171b48`):

| Field | chat | CLI | REST | web UI |
|-------|------|-----|------|--------|
| slug `intake-demo` | ✓ | ✓ | ✓ | ✓ (roster + detail) |
| id `5fd4d69d-…` | ✓ | ✓ (`projects list` column, `projects show`) | ✓ | ✓ (Summary → **Id**) |
| owner slug `intake-demo-lead` | ✓ | ✓ (`projects show` → `lead …`) | ✓ (`projectLeadSlug`) | ✓ |
| repository string | `file:///home/pdonoso/projects/eval-intake` | same | same | same (with its role) |

Evidence: `logs/p1-ready.out` … `logs/p4-container.out`, `logs/p3-after-cli.txt`, `logs/p4-after-cli.txt`,
`logs/s01r8-web-readback.json`, `logs/s01r8-web-projects.png`, `logs/s01r8-web-project-detail.png`
(the readback script keeps its suite-08 filename; it is suite 01's instrument in the run's own log dir).

## Result

**Run 10: binary pass. Score 10/10 — the suite is green, and for the first time the UI was driven.**

The three bullets this suite has never held all hold on run `s01r10`, on a fresh data dir, with every fix in
the tree before the stack came up: the **inspection** prompts answer their actual question from state; the
**intake** turns open an owned container from chat with zero work items and zero jobs; and **chat, CLI, REST
and the web UI agree on the slug, the id, the owner slug and the repository path string**. F-024 and F-030
were already closed at run 7; what run 10 adds is the surface half, and the oracle bullet table in
§ Verdict below carries each reading.

Two things about this verdict are worth stating before the evidence, because they are the difference between
a score and a ritual:

- **The UI was driven, live, by an operator instrument.** `logs/s01r8-web-readback.json` is a Playwright
  session against this run's own web on its own port, reading the Metadata card off the rendered DOM: `Slug`,
  **`Id`**, `Lead`, `Repository file:///home/pdonoso/projects/eval-intake (web)`. U3 has been `partial` since
  run 3 *because no run had driven the UI*; that is what changed.
- **The pass is on a tree that carries uncommitted fixes, and they are this work's own.** The commit that
  closes this phase carries them, and U5's requirement is met by run 10 being a fresh data dir taken with
  every one of them already in the tree — not by re-running after the commit. That distinction is stated
  rather than glossed: a reader comparing the SHA in the run's env with `develop`'s tip will find the fix
  files, which is the honest shape of a session that fixed and re-measured inside itself.

### Verdict, oracle bullet by bullet

| Oracle bullet | Verdict | The reading |
|---------------|---------|-------------|
| Public start path succeeded, or the failure is recorded as a product gap | **Pass, and the gap is recorded as F-110** | `./scripts/kampaku up` brought Core, worker and web up on a fresh data dir with `workersOnline: 1` — and **said** what was missing: *"WARNING: no default project on http://127.0.0.1:28000 … Run: …/kampaku bootstrap"*, which is the F-110 fix doing its job. The operator then ran exactly that command |
| Health/status reachable | **Pass** | `/api/v1/health` → `{"status":"ok"}`, `runtime/status` → `workersOnline: 1, workersKnown: 1` |
| The reply describes reality — no fiction, never an explicit empty state plus a clear ask | **Pass** | Prompts 1 and 2 named the one project, its repositories as urls, the ten-agent tree by slug, and `0 / 0 / 0` for work items, blockers and questions; prompt 2 listed the decisions a first run turns on and created nothing |
| After prompts 1 and 2, no project/agent/work item/repository file appeared that was not requested | **Pass** | Counts identical before and after both prompts: `projects=1 agents=10 jobs=0` |
| If prompt 2 produces a question, it is visible in the CLI **and** answerable in the UI | **Pass** | Prompt 1 raised `readiness-target` (`single_choice`, `required: true`); `gates list` rendered **1 card of 1 pending question** on the operator landing page, and `gates auto` answered it **through the UI**, taking the first option — recorded in `logs/gates-answered.md` with the options offered |
| A container with a stable slug/id, discoverable from chat, CLI and REST | **Pass** | `intake-demo` / `5fd4d69d-cadd-47a8-b235-db3365171b48` on all four surfaces |
| Its linked repository path is `<PATH>` and `<PATH>` exists as a directory on disk | **Pass** | `file:///home/pdonoso/projects/eval-intake`; `test -d` → yes |
| The path is **outside** the platform workspace | **Pass** | `/home/pdonoso/projects/…` vs the platform at `/home/pdonoso/kampaku` |
| An accountable owner is recorded, and agrees with the agent named as owner | **Pass** | `projectLeadAgentId 3824fb1b-…` resolves to `intake-demo-lead`, the slug the reply named and the web renders |
| Zero work items and zero jobs were created by opening the order | **Pass** | `work_items 0`, `jobs 0` after prompts 3 and 4; the reply states it delegated no work |
| The platform checkout's `git status --porcelain` is unchanged by the intake | **Pass** | 15 lines before and 15 after, **byte-identical** (`diff` clean). Those 15 lines are this work's own uncommitted fixes and the new prompts file, present before the intake — no line was added by the beat |
| Chat, CLI and web agree on the slug/id, the owner slug, and the repository path string | **Pass** | The four-surface table above; every field read on every surface |
| A work order opens from **chat** (the agent path), not only CLI/REST | **Pass** | Prompt 3's turn called `create_sub_agent` then `create_project` |

### The fix that closed the surface bullet

[F-109](../results/BOARD.md) is one row with three fields in it, and it was fixed in one commit-across-four-files:
the container's **id** is rendered wherever its slug is (both CLI reads and the UI Summary card); the repository
path is shown as **the string the container holds** on every operator surface rather than a re-spelled bare path;
and the **owner is resolved to a slug** by the server (`getEnrichedProjectOverview` → `projectLeadSlug`) so that
the CLI and REST cannot disagree with chat and the UI about how the owner is named. Both locks the suite names
carry it: `eval-work-order-intake.test.ts` reads the three fields off `projects list`, `projects show` **through
commander from source**, the served `GET /api/v1/projects/:slug`, and the agent path in one test; the web spec's
two existing assertions were **extended, not replaced**.

**Every half was verified red without the fix**, in isolation, on the compiled tree:

```
# id + url halves, rendering reverted
FAIL  carries the container's id and the repository string the store holds onto the non-chat surfaces
AssertionError: projects list does not print the container's id:
  expected 'intake-demo\tintake-demo\t[planning]…' to contain '91b58fe9-…'
# owner half only, lead line and resolution removed
AssertionError: REST does not resolve the link to the slug the other surfaces spell:
  expected undefined to be 'intake-demo-lead'
```

### Honest gaps, run 10

A run log that only records what passed is not a run log.

- **Prompt 4 does not name a CLI read subcommand, and it is right not to.** It holds no command tool, so it
  says so and declines to invent `projects show`. The suite's own bullet is satisfied — and the operator
  reading it still has to know the verb. The reply names `play`, `step` and `update` from its skill text and
  nothing about reading. Recorded, not raised as a row: it is a prompt-completeness question about which
  surfaces a seat may name, not a false claim.
- **`s01r8`'s prompt 4 answered in Chinese** and asked which container was meant. The same prompt on run 10
  answered in English with all three fields. That is **two samples of one prompt** and it is exactly the
  variance [roadmap 12](../../roadmap/12-measurement-program.md) § *The measurement is one sample* was written
  about, so it is recorded as an observation and not attributed to anything. [F-027](../results/BOARD.md)
  (replies ignored the prompt's language) is `resolved` on a single run's evidence; this is a second sighting
  and belongs in that row's history rather than in a new one.
- **The first prompt's question was `required: true` and asked for something the operator had already
  declined to give.** Prompt 1 says *do not change anything* and the reply raised a gate demanding the work
  order; it was answered by proxy and is harmless here, but a run that answers gates automatically will fill
  in free-text gates with the first option, which is why § Gates answered records every choice.
- **The fixture is the operator's to make, and the product says so twice.** `/home/pdonoso/projects/eval-intake`
  was deleted and recreated empty by hand before this run, because the product links a checkout and does not
  create one; run 10's prompt 3 then seeded seven files into it on `create_project`, which is the documented
  behaviour for an existing empty directory but is a **write the operator did not ask for** in that turn. It
  is recorded here rather than as a row because the reply reports the seed honestly (`repoBootstrap`, with the
  file list and the declared check) — but a stranger reading *"do not start any work"* would not expect seven
  files, and the suite's oracle reads the diff for exactly this reason.
- **The repository role `web` was a default the model could not justify.** Prompt 3's reply says so itself.
  The role is cosmetic in this beat; it is recorded because a fabricated justification is the defect class
  this suite exists to catch, and the honest disclosure is the behaviour the P-gates want.
- **One lock is red on a full-suite run in a way that is the operator's fault, and it was caught.**
  `eval-local-ports.test.ts` asserts the declared block when nothing is exported; sourcing a run's `run.env`
  before invoking vitest exports `KAMPAKU_CORE_PORT=28000 KAMPAKU_WEB_PORT=28004`, and `_common.sh` now
  **correctly** keeps a caller's value, so the control read the run's ports and failed. Re-run with the port
  variables unset: **30 files, 222 tests passed**. Recorded because a red suite that is an operator artifact
  is how an operator learns to ignore red — the same lesson [F-020](../results/BOARD.md) carries.

### Run 11 — 2026-10-20, re-measured on today's `develop`: **binary pass, 10/10**

Run `s01r11`, taken because fourteen days of work on suites 03–07 landed on the same tree after run 10 and a
suite that was green in October is not green by inheritance. Fresh data dir, own ports (28000 core, 28001 web),
`145c46a`, `deepseek-flash` through FreeLLMAPI at `http://127.0.0.1:3001/v1`. The fixture
`/home/pdonoso/projects/eval-intake` was **deleted and recreated empty** before `up`, and `create_project`
reported seeding it (`initializedRepository: true`, profile `neutral`, `make check` as the one declared check).

| Prompt | Wall | Tools | What the reply did |
|--------|------|-------|--------------------|
| 1 `Are we ready? …` | 10 s | `get_project`, `get_agent_dashboard` | The one container by slug **and id**, its four repositories as `file://` urls with the note that they point at the platform checkout rather than `kampaku-projects`, the ten-agent tree by slug, `0 / 0 / 0` for work items, blockers and questions — and what it had not read (`I have not read the four checkouts, and I have not run any check`) |
| 2 `Something is missing …` | 20 s | `get_project`, `triage_intent` | Named the two things only the operator can supply (a target and a scope sentence), created nothing, and raised **one required `single_choice` gate** — `first-run-target`, three named options |
| 3 `Open a work order … intake-demo …` | 16 s | `create_sub_agent`, `create_project` | Created `intake-demo-lead` first and passed it as `project_lead_slug` in the same `create_project`; reported the seeded files and the declared `make check` as a **declaration it had not run**; flagged that the repository role `core` was not something it had read. Zero work items, nothing delegated |
| 4 `Show me the container … confirm its id, owner, and repository path` | 10 s | `get_project` ×2 | Both containers with **id, owner slug and repository string**; said plainly that it holds no command tool and would not render a transcript as if it had |

Oracle, bullet by bullet, on this run:

| Oracle bullet | Reading |
|---------------|---------|
| Public start path succeeded, or the failure is recorded | `up` on the fresh data dir, and it **said** what was missing: *"no default project … Run: …/kampaku bootstrap"* — F-110's fix doing its job; the operator then ran exactly that command |
| Health/status reachable | `workersOnline: 1, workersKnown: 1`; `Core connected` on the landing page |
| The reply describes reality | Prompt 1 contradicts nothing in the stores; prompt 2 answers the question asked and creates nothing |
| Nothing appeared that was not requested | `projects=1 agents=10` before prompt 1 and after prompts 1 and 2, work items and jobs `0` throughout |
| A prompt-2 question is visible in the CLI **and** answerable in the UI | `questions list` printed it; the operator landing page rendered **1 card of 1** pending question with its three options; `gates auto` answered it **through the UI** — `1 answered, 0 left pending` |
| Container with stable slug/id on chat, CLI and REST | `intake-demo` / `f3821f5d-5a4c-4367-84fb-ccff66dd80cf` on all three, plus the web DOM |
| Repository path is `<PATH>` and exists on disk | `file:///home/pdonoso/projects/eval-intake`; `test -d` → yes |
| The path is outside the platform workspace | `/home/pdonoso/projects/…` vs `/home/pdonoso/kampaku` |
| Accountable owner recorded, agreeing with the named owner | `projectLeadAgentId 348db1dc-…`, `projectLeadSlug intake-demo-lead` over REST; the CLI prints `lead intake-demo-lead`; the web roster shows it |
| Zero work items and zero jobs | `workItems 0`, `milestones 0`, `jobs list` → `0 matching` after all four prompts and after the gate was answered |
| The platform checkout is unchanged by intake | `git status --porcelain` → **0 lines** before and after, byte-identical |
| Chat, CLI and web agree on slug/id, owner slug and repository string | four-surface table below |
| A work order opens from **chat** | Prompt 3's turn called `create_sub_agent` then `create_project` |

Four surfaces, container `intake-demo`:

| Field | chat | CLI | REST | web UI (DOM) |
|-------|------|-----|------|--------------|
| slug `intake-demo` | ✓ | ✓ (`projects list`, `projects show`) | ✓ | ✓ |
| id `f3821f5d-…` | ✓ | ✓ (both reads) | ✓ | ✓ (Summary → Id) |
| owner slug `intake-demo-lead` | ✓ | ✓ | ✓ (`projectLeadSlug`) | ✓ |
| repository string | `file:///home/pdonoso/projects/eval-intake` | same | same | same, with its role |

The web half is `logs/s01r11-web-readback.json`, a Playwright session against this run's own web on its own port,
reading the rendered DOM and not the API: `{slug: true, id: true, ownerSlug: true, repository: true}`, with
`logs/s01r11-web-landing.png` and `logs/s01r11-web-detail.png` beside it.

Locks, all green on this tree:

- `apps/core/tests/eval/eval-work-order-intake.test.ts` — **5 passed**; the F-109 case (*"carries the container's
  id and the repository string the store holds onto the non-chat surfaces"*) among them.
- `apps/web/e2e/eval-work-order-intake.spec.ts` — **6 passed (30.5 s)**, run from `apps/web`.
- `apps/core/tests/eval` — **34 files / 248 tests passed**, which is the whole battery's determinism, not just
  this suite's lock.

No product change was needed, and none was made: the tree at `145c46a` already holds every bullet. That is the
result this run exists to produce — a suite that was green on 2026-10-06 and is still green after suites 03–07
landed on the same files.

#### Honest gaps, run 11

- **Two harness defects, both mine, both costing a false reading before they were understood.** `gates list` and
  `gates auto` were first run when **zero** questions were pending (after prompt 1), and the instrument waits 30 s
  for `#pending-questions-card` and then prints a Playwright `TimeoutError`. Nothing was wrong with the product:
  it is the same shape `session-chain` warns about, an instrument that treats "nothing to show" as a failure. And
  `npx playwright test` must be run **from `apps/web`**: from the repo root Playwright finds no config, starts no
  fixture Core, and all six suite-01 tests fail with `connect ECONNREFUSED 127.0.0.1:28081` — which reads as six
  product regressions and is zero.
- **Prompt 4 names a subcommand with a placeholder slug** — `kampaku projects show <slug>` — where the operator
  asked to confirm *this* container. The three fields are all correct in the same reply, so the oracle bullet
  holds; the reading is recorded because a stranger copying that line gets a shell that refuses the placeholder.
- **Prompt 2's gate belongs to no project.** The `first-run-target` question is raised before any container but the
  default one exists, so `execution/` reports it as *"1 pending question belongs to no project"* and the gate holds
  the whole line until it is answered. That is the honest behaviour for a pre-scope decision and it is recorded
  here rather than raised as a row.
- **`gates auto` takes the first option** by construction, so the answer recorded in `logs/gates-answered.md` is
  "The existing kampaku container" — a choice the instrument made, not one the product made. Fine for the oracle
  bullet it satisfies (a gate must be *answerable* through the UI); it would not be fine as an operator decision.

### The run-7 record, kept because it is where the earlier halves closed

**Run 7: binary pass. Score 10/10 — the suite is green.** All four prompts answered their actual question, and both locks the suite names are now authored and running: the core lock drives intake through the chat path and checks the container against the stores, and the web lock drives the **UI** for the first time in this record and checks the CLI with it. U3 and U4 move from `partial` and `fail` to **pass**. Writing the second lock is also what found F-034, F-035 and F-036.

The container, read back from REST after prompt 3:

```text
projects: 2
  - intake-demo id=0eb2a38c status=planning lead=0d46998a
      repo: file:///home/pdonoso/.kampaku-eval-01/repos/intake-demo
  - kampaku id=2bff01d5 status=active lead=0d46998a
agents: 10
  overview intake-demo: workItems=0
work items total: 0
platform git status: 0
```

`0d46998a` is `kampaku-manager`, which is the slug the chat reply named. The lead is not merely
recorded; the reply and the store agree on it — and they agree on a **different** ran instance than
run 3, so this is not one lucky turn.

| Oracle bullet | Verdict |
|---------------|---------|
| Public start path succeeded | **Pass** |
| Health reachable | **Pass** |
| The reply describes reality | **Fail** — prompt 1 answered about the skill catalog; prompt 4 answered about the wrong project and omitted every field asked for |
| No unrequested entity appeared | **Pass** |
| A question is visible in CLI and answerable in UI | **Not reached** — `GET /api/v1/questions` → `{"questions":[]}` |
| Container with a stable slug/id on chat, CLI, and REST | **Pass** — `intake-demo`, `0eb2a38c` |
| Linked path is `<PATH>` and exists on disk | **Pass** — `test -d` → yes |
| Path is outside the platform workspace | **Pass** |
| Accountable owner recorded | **Pass** — `0d46998a` = `kampaku-manager`, second run in a row |
| Zero work items and zero jobs | **Pass** |
| Platform checkout unchanged by intake | **Pass** |
| Chat, CLI, web agree | **Partial** — chat, CLI, and REST agree on slug, owner, and path; the UI was not driven |
| A work order opens from **chat** | **Pass** |

### Run 5, in one paragraph each

**The capability fix landed and run 5 could not confirm it.** Prompt 4 called `get_project` — the right
tool — with the argument `"Youqa"`, a name that matches no project, and reported that no such project was
listed. The fields are now in the tool's return, so what remains is not a missing capability but
**fabricated argument selection**, which no return-type change addresses.

**The refusal path works, and that is a win worth its own line.** Prompt 3 passed
`project_lead_slug: "youaku-skillmaster"`, which does not exist, and the tool **refused**, told the model
to create the lead first, and persisted nothing — the oracle read `projects: 1` immediately afterwards.
Requiring a lead is one half of F-005; refusing a bad one without leaving an orphan is the half that
protects the store, and it now has an observation behind it rather than a lock.

**Prompt 1 was the worst shape since run 1:** `tools: none`, "no active projects listed here" while one
existed, and a team listing three agents that do not exist.

**And the caveat that governs all of the above.** Prompt 1 has now produced `none / 4 tools / 3 tools /
3 tools / none` across five runs on the same prompt. Runs 4 and 5 differ only by a change to `get_project`,
which prompt 1 does not touch. One turn per prompt is **one sample**, and the variance is at least as
large as the effects this record has been attributing. The safe claim is that the suite has never passed;
the *shape* of each individual run is not evidence. [roadmap 12](../../roadmap/12-measurement-program.md) § The
measurement is one sample carries the table and the plan, which is to repeat each prompt N times before
another product attempt.

Suite-specific checklist, against run 4:

- [x] Inspection does not mutate projects, agents, or work items
- [x] A work order opens from **chat** (the agent path), not only CLI/REST
- [x] The linked repository path exists on disk and is outside the platform workspace
- [x] An accountable owner is recorded on the container
- [x] Intake creates zero work items and zero jobs
- [x] The platform checkout is unchanged by intake

The suite-specific list is therefore **complete** while the oracle bullets are not, in two consecutive
runs. Everything the container has to be, it is. What fails is the factory's ability to **report** it,
and run 4 sharpened that: prompt 4 moved from asking the operator for a name (no tool) to **reading**
state with `get_project` — and then answering about `kampaku` instead of `intake-demo`, without the id,
the owner, or the repository path it was asked to confirm. Reading state and serving the answer are two
different acts, and the second one has now failed with and without the read.

### What run 4 does to the plan

Four runs, four shapes, and the instruction is the one variable that changed nothing:

| Run | Inspection outcome |
|-----|--------------------|
| 1 | answered from memory, invented a roster |
| 2 | 4 tools, truthful, named neither project nor team |
| 3 | 3 tools, answered about the skill catalog |
| 4 | 3 tools, answered about the skill catalog — after 30.2% of the turn was removed |

The information is already computed every turn, from the stores, with exactly the fields the operator
asked for. The defect is not that the agent cannot read it; it is that the reply is generated instead of
**rendered**. That is why [BOARD F-024](../results/BOARD.md) now recommends pre-armed read flows for the
common questions, and why the next attempt at this suite should test that rather than a fifth prompt.

Universal and factory gates, against run 3: **U1** empty instance — pass. **U2** public docs — pass.
**U3** three surfaces agree — **pass**: chat and the stores by the core lock, REST and the web UI by the
web lock, and the CLI spawned in the same spec against the same core. **U4** automated tests — **pass**:
both locks are authored and green. **U5**
fresh re-run after a fix — pass. **U6** no silent budget failure — pass. **U7** criteria stay
product-level — pass. **U8** no open blocking row — **pass**: the rows this suite closed by run 7 are
F-024, F-027 and F-030, and the rows still open (F-031, F-033, F-034, F-035, F-036) are not bullets of
this suite's oracle.
In-scope **P7 Work-order intake**: the container is reachable and owned on every surface, so the gate
holds for the container itself. Soft **P3**: prompt 2 again asked its decisions as prose, so no durable
question existed to answer.

### Run 2 result, for comparison

Kept because the difference is the measurement: the same four prompts, one commit apart.

```text
  - intake-demo id=c7104b21 status=planning lead=none
```

| Bullet that changed | Run 2 | Run 3 |
|---------------------|-------|-------|
| Accountable owner | **Fail** — `lead=none` | **Pass** — `kampaku-manager` |
| Prompt 4 vocabulary | Docker, offered to simulate output | Project, correct reading, no simulation |
| Prompt 1 answer | Work items and blockers | Skill catalog |

Run 2's P7 read, kept for the contrast: the container was reachable on every surface and the owner
bullet failed, so the gate did not hold. Soft **P3** failed in both runs, in the same way.

## Evidence

- [Baseline run record](../baseline-20260924.md) — parameters, per-run table, environment facts, findings
- Run 4 prompts: `~/.kampaku-eval-01/r4-prompt{1,2,3,4}.out`
- Prompt 1 is the inspection failure, **unchanged from run 3**: `tools: get_agent_dashboard,
  list_agents, list_skills`, and the answer lists skills and then describes a call to
  `get_agent_capacity` it does not make — with a placeholder `"agent_slug": "example-agent"` and an
  offer to proceed
- Prompt 3 is the stable one: `mode: llm · model: qwen2.5:14b · tools: create_project`, and the reply
  names the owner: *"the project lead is `kampaku-manager`"*
- Prompt 4 is the sharpest failure: `tools: get_project`, and the reply is about `kampaku` rather than
  `intake-demo`, with no id, no owner, and no repository path — the three fields it was asked to confirm,
  all of which were in the durable-state block and all of which REST returned
- State read back over REST after prompt 3: `projectLeadAgentId: 0d46998a-…` = `kampaku-manager`
- Oracle instrumentation: `~/.kampaku-eval-01/oracle.py` — documented REST API only, never SQLite

### A wrong finding, caught before it was recorded

Prompt 1's description of a `get_agent_capacity` call reads, at first glance, as an invented schema:
`capacity_limit`, `include_subordinates`, `required_skills`. All three are real, declared in
`apps/core/src/agents/runtime/tools/agent-capacity.ts`. The turn simulated a call; it did not fabricate
an interface. The distinction matters and was one `grep` away from being lost.

## Blocker

**Nothing blocks this suite.** Runs `s01r10` and `s01r11` are binary passes at 10/10 — run 11 is the latest and
was taken after suites 03–07 landed on the same tree — and no `open` row is a bullet of the oracle. The rows that were opened by this work are closed with the measurement that closed them, and the one
open row that touches this suite is open because it holds a **decision**, not a defect:

| Row | Status | Why it is not blocking |
|-----|--------|------------------------|
| [F-109](../results/BOARD.md) | **resolved** | The surface bullet. Closed by the fix measured on run `s01r10`, every half verified red in isolation first |
| [F-110](../results/BOARD.md) | **resolved** | The first-run bullet. Closed by the fix measured on run `s01r10` — `up` on a fresh data dir now prints the missing step and the exact command, and `install.sh`'s last step runs a script that exists |
| [F-026](../results/BOARD.md), [F-032](../results/BOARD.md), [F-031](../results/BOARD.md) | `open` | Open, and **not a bullet of this oracle**: F-026 is settings precedence, F-032 is endpoint truncation (this run's endpoint advertises 1 M-token contexts and `/v1/models` answered in 0.035 s), F-031 is a skill fragment naming an unregistered tool. Run 7's U8 note made the same distinction |

### The one decision this work deliberately did not take

[F-110](../results/BOARD.md) was fixed in the **non-creating** direction: `serve` and `dev` state that a default
project is missing and name the command; they do not create it. That is right for this suite — its oracle reads
a fresh instance's contents, and a start path that quietly wrote a container would change what the suite
measures — and it leaves a product question for the emperor rather than for a fix session: **should starting
the stack also open the default work order?** The two behaviours are both defensible and they are not
equivalent, which is why the fix holds the line at *say it, do not silently do it* and `apps/core/tests/eval/
eval-first-run-bootstrap.test.ts` fails if a start path grows that side effect.

### Blocker as it stood at run 7 (kept for the record)

[BOARD F-024](../results/BOARD.md) — inspection does not answer the question asked. Four runs, four shapes,
no pass. The row now carries the recommendation, because three prompt rewrites and one context cut have
all failed: the common questions should be **deterministic flows**, so the answer is rendered from the
stores rather than generated around them.
[F-030](../results/BOARD.md) — `show me the container` now reads state and still misreports: it read
`get_project`, answered about the wrong project, and omitted the id, owner, and path.
[F-031](../results/BOARD.md) — a *narrower* version of the same family: a skill fragment can declare a tool
the runtime never registers, and one was found by the lock written for the context change.

**F-005 is closed** and [F-029](../results/BOARD.md) holds halfway — the vocabulary half verified live, the
route half moved to F-030. A closed row is not a green suite, so the suite stays a binary fail.

Suites **02–25** are no longer blocked on intake: the container is created from chat, it is owned, and
its repository path is real and outside the platform. They stay `not run` because starting 02 on a
failing 01 would repeat the mistake this program exists to remove — not because intake is missing.

The two locks are authored, which is what moved the score from 9 to 10: the intake-from-chat test and
the web e2e test that reads the container out of the UI. The UI was not driven in any of the three
runs, and U3 stays `partial` until it is.

Deterministic locks that do exist: `apps/core/tests/eval/eval-orchestrator-contract.test.ts`,
`apps/core/tests/agents/create-project.test.ts`, `apps/core/tests/application/repository-policy.test.ts`,
`apps/core/tests/agents/durable-state.test.ts`, `apps/core/tests/agents/kampaku-agent-prompt.test.ts`.
None exercises a live turn, which is why none of them caught the owner gap, the vocabulary collision,
or — the run-3 lesson — a turn that reads state and answers something else.
