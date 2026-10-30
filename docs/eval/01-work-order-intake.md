# 01 — Work-order intake

## Promise tested

A stranger can bring the factory up from the public docs, ask what exists, and open a work order —
and the container that the order lives in is reachable and consistent on every surface.

> **Run 4: binary fail, fourth time.** Intake works and the container is **owned** — stable across
> runs 3 and 4 ([BOARD F-005](results/BOARD.md) closed by observation). The first bullet has now failed
> four times in four shapes, including once after 30.2% of the turn was removed, so the next fix is a
> change of mechanism rather than another prompt edit: [BOARD F-024](results/BOARD.md) now carries the
> recommendation to make the common reads deterministic flows. Run parameters, all four runs, and the
> full finding ledger are in the [baseline run record](archive/baseline-2026-09-24.md).

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

- Follow [00-protocol.md](00-protocol.md) to an empty data dir and a running stack.
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
endpoint**, the way [F-008](results/BOARD.md) records model-level failures. Concretely:

1. The oracle bullet that fails is marked **`not met — endpoint capability`**, with the model, the
   endpoint and the run cited.
2. [F-024](results/BOARD.md) / [F-030](results/BOARD.md) close as *product work complete, endpoint
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

## Evaluation status

The recorded verdict and checklist above remain the suite status. Detailed manual run logs, prior results, evidence, and historical blocker notes are in the [historical suite record](archive/01-work-order-intake-2026-10-30.md).

For current open product gaps, consult the [evaluation board](results/BOARD.md).
