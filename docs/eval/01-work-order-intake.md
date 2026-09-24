# 01 — Work-order intake

## Promise tested

A stranger can bring the factory up from the public docs, ask what exists, and open a work order —
and the container that the order lives in is reachable and consistent on every surface.

> **Run 4: binary fail, fourth time.** Intake works and the container is **owned** — stable across
> runs 3 and 4 ([BOARD F-005](results/BOARD.md) closed by observation). The first bullet has now failed
> four times in four shapes, including once after 30.2% of the turn was removed, so the next fix is a
> change of mechanism rather than another prompt edit: [BOARD F-024](results/BOARD.md) now carries the
> recommendation to make the common reads deterministic flows. Run parameters, all four runs, and the
> full finding ledger are in the [baseline run record](baseline-20260924.md).

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

Marked against run 3, the latest measurement. The suite is a binary fail, so U8 stays unticked by
definition: the gates are only all-green at 10.

- [x] U1 Empty instance — fresh data dir, wiped before the run
- [x] U2 Public docs sufficient — `bootstrap` then `serve` from the documented config
- [ ] U3 Chat + CLI + web agree on ids/fields — chat, CLI and REST agree; **the UI was not driven**
- [ ] U4 Automated tests cited below are green — two of five are still *to author*
- [x] U5 Fresh data-dir re-run after any fix — runs 3 and 4 are exactly that
- [x] U6 No silent budget failure hiding the oracle — no budget was hit; every turn reported its model and tools
- [x] U7 Pass criteria stay product-level — every verdict is an observable fact
- [ ] U8 No open blocking BOARD row for this suite — F-024 and F-030 are open, now also F-031
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
| `apps/core/tests/eval/eval-work-order-intake.test.ts` | Intake from chat creates a container whose repository path exists and is outside the workspace; zero work items; three-surface slug parity | **To author** |
| `apps/web/e2e/eval-work-order-intake.spec.ts` | Container visible in the UI with the same slug and path | **To author** |

Without committed tests, the score is capped at **9**. Listing an existing test is not a substitute
for a test that locks *this* suite's promise.

## Pass

- Binary: all oracle bullets hold.
- Score: **10** / 10.
- Green only at 10 with U1–U8 + F1–F5 + suite-specific + in-scope P-gates + automated tests.

## Run log

Three runs on 2026-09-24, each on a fresh instance against a real endpoint, each after a fix. Only the
newest counts.

| Field | Run 1 | Run 2 | Run 3 | Run 4 |
|-------|-------|-------|-------|-------|
| Time | 17:51 UTC | 18:09 UTC | 19:08–19:34 UTC | 19:45–19:57 UTC |
| Git SHA | `a5226d6` | `cce70de` | `6b16437` | `4ffe6d2` (clean tree, rebuilt `dist`) |
| Data dir | `.kampaku-eval-01/data` (fresh) | wiped, fresh | wiped, fresh | wiped, fresh |
| Model | `qwen2.5:14b`, then `qwen2.5:7b-instruct` | `qwen2.5:14b` (the value persisted at bootstrap; see [F-026](results/BOARD.md)) | `qwen2.5:14b` | `qwen2.5:14b` |
| Endpoint | `http://127.0.0.1:11434/v1` | same | same | same |
| `<PATH>` | `.kampaku-eval-01/repos/intake-demo` | same | same | same |
| Wall clock | 2 turns, then stopped | 4 prompts, ~86 s for the longest turn | 4 prompts, 26 min wall clock | 4 prompts, ~12 min |
| Outcome | Blocked at prompt 1 | Intake works; owner and prompt-4 vocabulary fail | **Owner recorded**; prompts 1 and 4 fail | **Owner holds**; prompt 1 unchanged, prompt 4 reads state and still misreports |

Full parameters, environment facts, and the operator-defect ledger: [baseline run
record](baseline-20260924.md).

## Result

**Run 4: binary fail. Not scored.** The owner bullet holds for the second run in a row; two bullets do
not, and one of them was unchanged after a 30.2% cut to the turn.

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
**rendered**. That is why [BOARD F-024](results/BOARD.md) now recommends pre-armed read flows for the
common questions, and why the next attempt at this suite should test that rather than a fifth prompt.

Universal and factory gates, against run 3: **U1** empty instance — pass. **U2** public docs — pass.
**U3** three surfaces agree — partial, UI not driven. **U4** automated tests — not satisfied: the two
locks this suite's table lists are still **to author**, so the score is capped at 9 regardless. **U5**
fresh re-run after a fix — pass. **U6** no silent budget failure — pass. **U7** criteria stay
product-level — pass. **U8** no open blocking row — **no**, F-024 and F-030 are open.
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

- [Baseline run record](baseline-20260924.md) — parameters, per-run table, environment facts, findings
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

[BOARD F-024](results/BOARD.md) — inspection does not answer the question asked. Four runs, four shapes,
no pass. The row now carries the recommendation, because three prompt rewrites and one context cut have
all failed: the common questions should be **deterministic flows**, so the answer is rendered from the
stores rather than generated around them.
[F-030](results/BOARD.md) — `show me the container` now reads state and still misreports: it read
`get_project`, answered about the wrong project, and omitted the id, owner, and path.
[F-031](results/BOARD.md) — a *narrower* version of the same family: a skill fragment can declare a tool
the runtime never registers, and one was found by the lock written for the context change.

**F-005 is closed** and [F-029](results/BOARD.md) holds halfway — the vocabulary half verified live, the
route half moved to F-030. A closed row is not a green suite, so the suite stays a binary fail.

Suites **02–25** are no longer blocked on intake: the container is created from chat, it is owned, and
its repository path is real and outside the platform. They stay `not run` because starting 02 on a
failing 01 would repeat the mistake this program exists to remove — not because intake is missing.

Two locks are still **to author** and are why the score is capped at 9: the intake-from-chat test and
the web e2e test that reads the container out of the UI. The UI was not driven in any of the three
runs, and U3 stays `partial` until it is.

Deterministic locks that do exist: `apps/core/tests/eval/eval-orchestrator-contract.test.ts`,
`apps/core/tests/agents/create-project.test.ts`, `apps/core/tests/application/repository-policy.test.ts`,
`apps/core/tests/agents/durable-state.test.ts`, `apps/core/tests/agents/kampaku-agent-prompt.test.ts`.
None exercises a live turn, which is why none of them caught the owner gap, the vocabulary collision,
or — the run-3 lesson — a turn that reads state and answers something else.
