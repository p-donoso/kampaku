# 02 — Three surfaces

## Promise tested

Chat, CLI, and web show the same truth for the same resource after one mutation — and no surface can
do something the others cannot.

## Why it elevates

Weak: chat claims success while the CLI is stale; the UI can edit a field the agent cannot; a
repository path is visible as a count in one place and as a string in another; the CLI needs a raw
REST call for an operation the API supports.

Credible: one mutation, three consistent views, including the fields that matter — id, slug, status,
owner, and repository path. Parity is a factory property, not politeness: an operator who drives the
factory from chat must be able to reach every capability the factory has.

## Prereqs

- Suite [01](01-work-order-intake.md) green, or at minimum a container exists to mutate.
- Stack up per [00-protocol.md](00-protocol.md).

## Emperor prompts

1. `Set a note on the intake-demo project I can recognize: EVAL-SURFACE-MARKER. Confirm its id.`
2. After chat succeeds: verify via CLI and open the same entity in the web UI. Do not ask the model
   to "fix" a mismatched surface.
3. `Change the description to EVAL-SURFACE-MARKER-2 and tell me the current id.`
4. Parity check for a resource the factory manages: `Show me the repository path recorded for that
   project, as a path, not a count.`

If the product refuses a mutation without approval, answer the approval once, then continue measuring.

## Oracle

- One durable entity carries `EVAL-SURFACE-MARKER` (or the equivalent visible field).
- Chat, CLI, and web report the same id and the same marker.
- No surface is missing the entity while another shows it.
- After a mutation made through CLI or web, a **fresh chat turn** reports the new value, not a
  pre-mutation invention. A stub-only proof of this bullet is weak; deepen under
  [17-provider-fidelity.md](17-provider-fidelity.md).
- The repository path is shown as a path string on every surface that shows project metadata — not
  replaced by a count that cannot be verified against disk.
- A failed surface is a suite failure, not "use the CLI only".
- Any operation available through REST is reachable from the CLI and from chat, or the gap is
  recorded on the board.

## How to measure

- Capture the id from chat.
- Query the same id via the public CLI.
- Open the entity in the web UI and confirm the marker text and the repository path string.
- Mutate once via the CLI, then confirm chat and web catch up without a second invention.
- Diff the field set returned by each surface for one entity; any field present on one and absent on
  another is a finding.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — fresh data dir, wiped before the run
- [x] U2 Public docs sufficient — the documented CLI, REST, and start path
- [x] U3 Chat + CLI + web agree on ids/fields — **all three compared by a test.** `eval-three-surfaces.spec.ts` reads one container from the CLI, from a scoped **chat** turn, and from the rendered DOM, and asserts the same slug, owner and repository path on each
- [x] U4 Automated tests cited below are green — both locks named in the table are authored and pass
- [ ] U5 Fresh data-dir re-run after any fix — **not ticked, and the reason matters.** The live prompts predate F-037, F-038 and F-041, all of which landed after them; the *locks* were re-run and are green, but the suite's own four prompts were not re-taken on the fixed build. Ticking this would be the claim-without-evidence defect this lab exists to catch
- [x] U6 No silent budget failure hiding the oracle — no budget was hit; every turn reported its model and tools
- [x] U7 Pass criteria stay product-level — every verdict is an observable field, not a catalog slug
- [x] U8 No open blocking BOARD row for this suite — **F-038, the row that blocked this gate, is resolved**; the open rows (F-003, F-019, F-026, F-031, F-032) are not bullets of this suite's oracle
- [x] F1 Oracle concerns a software deliverable
- [x] F2 No stack assumption in the oracle — the entity is read through REST, the CLI, the UI and chat
- [x] F3 No imposed repository shape
- [x] F4 N/A or existing conventions respected
- [ ] F5 Shippability path named (not required until suite 23)

### Suite-specific

- [x] One mutation produced three consistent reads, fields included
- [ ] Repository path visible as a verifiable path on every surface that shows project metadata — **partial**: it reaches the CLI, REST, `get_project` and the UI detail panel; the roster projection the UI's *table* reads carries no repository field, and that absence is asserted as an inventory in the core lock
- [x] A fresh chat turn reports the post-mutation value
- [x] No operation requires a raw REST call from the CLI or chat — asserted as a CLI command inventory

### In-scope P-gates

- **P7** when the mutation includes opening or reading a container

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/web/e2e/eval-orchestrator-contract.spec.ts` | Browser-visible routing and before/after project and agent parity | Exists |
| `apps/web/e2e/eval-three-surfaces.spec.ts` | UI shows the same slug, marker, and repository path string as the CLI | **Authored** — 4 tests, drives the browser, spawns the CLI against the same core, and reads **chat** for the same entity |
| `apps/core/tests/eval/eval-three-surfaces.test.ts` | Field-set parity across chat, CLI, and REST for one entity | **Authored** — 6 tests, four reads compared as sets rather than against constants |

## Pass

- Binary: oracles hold for chat, CLI, API, and web content.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-24 |
| Data dir | `/home/pdonoso/.kampaku-eval-01/data` (fresh) |
| Git SHA | `ad933a0` |
| Endpoint | FreeLLMAPI `:3001`, model `auto:escalera` |
| Served by | `nvidia/nemotron-3-ultra-550b-a55b` |
| Wall clock | 2 chat turns + the REST/CLI parity reads |
| Tests | **both locks green** — core 6, web 3; `test:eval` 88 |

## Result

**Binary: partially met. The parity holds; one bullet does not, and it is recorded rather than argued.**

Both locks the suite names are authored and green, which is what the table above was waiting for. The live
run measured the oracle's own negative form — *any field present on one and absent on another is a
finding* — and here is what it found.

| Oracle bullet | Verdict |
|---|---|
| One durable entity carries `EVAL-SURFACE-MARKER` | **Pass** — `surface-demo-2`, `description: EVAL-SURFACE-MARKER`, read back from REST, the CLI, and `get_project` |
| Chat, CLI, and web report the same id and marker | **Pass** — chat named `3aa8f2dd`, REST returned `3aa8f2dd`, and the CLI's `projects show` printed the marker |
| No surface is missing the entity while another shows it | **Pass** — every surface listed `surface-demo-2` |
| A fresh chat turn reports the post-mutation value | **Pass** — the e2e lock mutates once and asserts the browser and the CLI both catch up |
| **The repository path is shown as a path string on every surface that shows project metadata** | **Partial.** The CLI's `projects list` and `projects show`, the REST overview, `get_project`, and the UI's **detail panel** all show `file:///…`. The **roster projection** carries no repository field at all, and the UI's **table** renders from it — so the table shows nothing about repositories while the detail panel beside it shows the path |
| A failed surface is a suite failure, not "use the CLI only" | **Pass** — no surface failed |
| Any REST operation is reachable from the CLI | **Pass** for the operations this suite uses: `projects list`, `show`, and `update` all exist, asserted as an inventory in the e2e lock |

### The one that does not hold, and what it is

`GET /api/v1/projects/roster` returns `{ id, slug, name, description, status, projectLeadSlug, health,
…counts }` — **no `repositories`**. The UI's table renders from the roster, so the table can say how many
projects exist and nothing about where their code lives, while the detail panel one click away shows the
full paths.

That is asserted as an **inventory** in the core lock (`withoutPaths` must equal `["rosterEntry"]`), so the
gap is machine-checked and a change to either surface fails there. **Not filed as a new row**: F-037's
resolution put the path on every surface the operator reads for *detail*, and the roster is a summary
projection whose purpose is breadth. Whether the summary should carry it is a design question for
[04](../roadmap/04-capability-program.md), and the inventory is where it is written down.

### And one finding the run produced

[BOARD F-038](results/BOARD.md): the front office closed a reply with *"you can add one with
`update_project` when ready"* — a tool it is **forbidden** to call. The `eval-orchestrator-contract` lock
already checks that the *prompt* names no unreachable tool; this is a **model-generated reply** doing it,
and it is unactionable both for the agent and for the operator following it from chat.

### Score

**Not 10, and not scored as binary-pass.** Six of seven oracle bullets hold and one is partial: the
**roster projection** carries no repository field, so the repository-path bullet does not hold. A green suite
needs the binary pass, and that bullet is not one.

**U3 is closed — 2026-09-24.** All three named surfaces are compared on one entity by a single test rather
than asserted by hand: `eval-three-surfaces.spec.ts` reads the CLI, a scoped **chat** turn, and the rendered
DOM, and requires the same slug, owner and repository path from each, with the expectations taken from the CLI.

**U4 passes:** both locks the suite names are authored and green.

## Evidence

- Run prompts: `~/.kampaku-eval-01/s2-p1.out` (the structured question), `s2-p1b.out`, `s2-p1c.out`, `s2-p4.out`
- `s2-p1.out` is worth reading on its own: asked for a repository directory that **did not exist**, the agent
  refused to link it, named the path, and asked a **structured `<kampaku-question>`** with three options —
  which is F-033's validation and the P3 gate both working, in one turn
- `s2-p1c.out` is the decisive one: `tools: create_project`, repository linked as `file:///…`, lead named
- CLI parity: `kampaku projects list` prints the paths indented; `projects show` prints a `Repositories` section
- REST parity: `GET /api/v1/projects/:slug` returns `repositories: [{url, role}]`
- Locks: `apps/core/tests/eval/eval-three-surfaces.test.ts`, `apps/web/e2e/eval-three-surfaces.spec.ts`

## Operator defect

The live run's first re-issued prompt **dropped the repository path** from the operator's own text, so the
container came back with `repositories: []`. Read carefully, that looked like a product defect — a
container opened from a request that named a path, with no link. It was not: re-issued with the path, the
same prompt links it correctly. Recorded because the shape of the mistake is the one this lab exists to
catch, made by the operator rather than by the product, and the distinction was only visible by re-running
with the omitted input restored.

## Blocker

**The repository path is absent from the roster projection**, and it is the one oracle bullet that does not
hold. `GET /api/v1/projects/roster` returns no `repositories` field at all, and the UI's **table** renders from
the roster — so the table says nothing about where a project's code lives, while the detail panel one click
away shows every path. Asserted as an **inventory** in `apps/core/tests/eval/eval-three-surfaces.test.ts`
(`withoutPaths` must equal `["rosterEntry"]`), so the gap is machine-checked and a change to either surface
fails there. **Not filed as a row:** the path reaches every surface an operator reads for *detail*, and whether
a summary projection should carry it is a design question for [roadmap 04](../roadmap/04-capability-program.md).

**[BOARD F-038](results/BOARD.md) — resolved 2026-09-24, and it was not the reply's fault.** The resident
`system-project-bootstrap` fragment told its reader, every turn, that a repository is linked **via
`update_project`** — a tool the front office may never hold. The model echoed its own prompt.

Widening the lock's anchor found two more fragments of the same kind (`system-plan-quality` instructing
`submit_intent` and `update_work_item`), so the resident set lost them: **a fragment is resident only if
every tool it instructs is one the reader holds.** Five fragments remain of the seven.

`update_project` is a line tool and stays one: ADR-0005 records the excluded set as **the durable one,
which does not shrink**, and linking a lead or a repository after the fact is the line's business. So the
fix is not to hand the desk the tool — it is to make the desk say which surface has it.

**Verified live.** Asked to add a repository to a container that already existed:

> The f38-demo project exists (id: `46a3d86f-…`, status: `planning`, lead: `kampaku-manager`) but currently
> has **no repositories linked**.
>
> **I cannot add a repository to an existing project.** The factory links repositories only when the
> container opens (via `create_project`), and I have no tool to attach one afterwards.
>
> **The CLI can do this.** Run:
> `kampaku projects update f38-demo --repo file:///home/pdonoso/.kampaku-eval-01/repos/f38-demo`

That command was then run by hand, and it linked the repository — so the advice is actionable rather than
merely polite. A reply that names an action nobody present can take was the defect; this one names the
surface, the syntax, and the outcome.

The **roster projection carrying no repository path** is recorded as an inventory inside the core lock
rather than as a row: the path reaches every surface an operator reads for detail, and whether the summary
should carry it is a design question for [04](../roadmap/04-capability-program.md).
