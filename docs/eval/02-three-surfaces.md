# 02 — Three surfaces

## Promise tested

Chat, CLI, and web show the same truth for the same resource after one mutation — and no surface can
do something the others cannot.

> **Run `s02r3` (2026-10-19): binary pass, 10/10, on a fresh data dir.** The two rows that stood in the
> way are closed and measured: [F-112](../eval/results/BOARD.md) — the roster projection carried no
> repository field, so the UI's table was the one surface that could say nothing about where a project's
> code lives — and [F-111](../eval/results/BOARD.md) — no role in the agent path could change an existing
> container's fields, so prompt 3 could only be answered by refusal. Both fixes are in the tree before the
> stack came up for run `s02r3`, and every oracle bullet was read from the product's own surfaces on that
> run's data dir.

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
- [x] U5 Fresh data-dir re-run after any fix — run `s02r3` is exactly that: a new data dir (`.kampaku/runs/s02r3/data`), the stack brought up with every fix in the tree, and the suite's own four prompts re-taken. The earlier note — that the live prompts predated F-037/F-038/F-041 — is why the previous verdict was not scored; that debt is now paid
- [x] U6 No silent budget failure hiding the oracle — no budget was hit; every turn reported its model and tools
- [x] U7 Pass criteria stay product-level — every verdict is an observable field, not a catalog slug
- [x] U8 No open blocking BOARD row for this suite — **F-038, the row that blocked this gate, is resolved**; the open rows (F-003, F-019, F-026, F-031, F-032) are not bullets of this suite's oracle
- [x] F1 Oracle concerns a software deliverable
- [x] F2 No stack assumption in the oracle — the entity is read through REST, the CLI, the UI and chat
- [x] F3 No imposed repository shape
- [x] F4 N/A or existing conventions respected
- [ ] F5 Shippability path named (not required until suite 23)

### Suite-specific (read off run `s02r3`)

- [x] One mutation produced three consistent reads, fields included
- [x] Repository path visible as a verifiable path on every surface that shows project metadata — **holds.** [F-112](../eval/results/BOARD.md) closed it: `ProjectRosterEntry` carries `repositories`, the projects table renders them under a **Repository** column, and the core lock's inventory is inverted (`withoutPaths` must be `[]`). Read off the rendered DOM on run `s02r3` (`logs/s02r3-web-readback.json`): the table row shows `file:///home/pdonoso/projects/eval-intake` beside the slug, and the detail panel shows the same string
- [x] A fresh chat turn reports the post-mutation value
- [x] No operation requires a raw REST call from the CLI or chat — the CLI's `list`/`show`/`update`/`create` exist (asserted as an inventory in the web lock), and the metadata write prompt 3 asks for is reachable from **chat** as of [F-111](../eval/results/BOARD.md): the front office delegates it to the container's own lead, which now holds `update_project` for the container it leads

### In-scope P-gates

- **P7** when the mutation includes opening or reading a container

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/web/e2e/eval-orchestrator-contract.spec.ts` | Browser-visible routing and before/after project and agent parity | Exists, green |
| `apps/web/e2e/eval-three-surfaces.spec.ts` | UI shows the same slug, marker, owner and repository path string as the CLI, and the **table** shows the path itself | **5 tests, green** — drives the browser, spawns the CLI against the same core, and reads **chat** for the same entity. The table test was red with the detail-panel-only fix reverted |
| `apps/core/tests/eval/eval-three-surfaces.test.ts` | Field-set parity across chat, CLI, and REST for one entity; the roster carries the paths; the container's own lead can change them and a seat that leads nothing cannot | **8 tests, green** — four reads compared as sets rather than against constants. 3 red before the F-111 fix, 1 red before the F-112 fix |

## Pass

- Binary: oracles hold for chat, CLI, API, and web content.
- Score: **10** / 10.

## Evaluation status

The recorded verdict and checklist above remain the suite status. Detailed manual run logs, prior results, evidence, and historical blocker notes are in the [historical suite record](archive/02-three-surfaces-2026-10-30.md).

For current open product gaps, consult the [evaluation board](results/BOARD.md).
