# 01 — Work-order intake

## Promise tested

A stranger can bring the factory up from the public docs, ask what exists, and open a work order —
and the container that the order lives in is reachable and consistent on every surface.

> **This suite is expected to fail today.** The agent path cannot create a project container
> ([ADR-0005](../adr/0005-factory-authority-model.md), [BOARD F-001](results/BOARD.md)). Run it,
> record the failure, and close the board row — do not measure around the broken path.

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

Mark each during the run:

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Chat + CLI + web agree on ids/fields
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Oracle concerns a software deliverable
- [ ] F2 No stack assumption in the oracle
- [ ] F3 No imposed repository shape
- [ ] F4 N/A or existing conventions respected
- [ ] F5 Shippability path named (not required until suite 23)

### Suite-specific (all must be yes for 10)

- [ ] Inspection does not mutate projects, agents, or work items
- [ ] A work order opens from **chat** (the agent path), not only CLI/REST
- [ ] The linked repository path exists on disk and is outside the platform workspace
- [ ] An accountable owner is recorded on the container
- [ ] Intake creates zero work items and zero jobs
- [ ] The platform checkout is unchanged by intake

### In-scope P-gates

- **P7 Work-order intake** — required
- Soft **P3** when prompt 2 asks a question

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

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Model / provider | — |
| Wall clock | — |
| `<PATH>` | — |
| Tests | not run |

## Result

`not run` — awaiting execution. Expected to fail until
[ADR-0005](../adr/0005-factory-authority-model.md) is implemented.

## Evidence

None yet.

## Blocker

[BOARD F-001](results/BOARD.md) — the root agent's allowlist excludes `create_project`, so the agent
path cannot open a work order.
