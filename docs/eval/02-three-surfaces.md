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

### Suite-specific

- [ ] One mutation produced three consistent reads, fields included
- [ ] Repository path visible as a verifiable path on every surface that shows project metadata
- [ ] A fresh chat turn reports the post-mutation value
- [ ] No operation requires a raw REST call from the CLI or chat

### In-scope P-gates

- **P7** when the mutation includes opening or reading a container

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/web/e2e/eval-orchestrator-contract.spec.ts` | Browser-visible routing and before/after project and agent parity | Exists; extend |
| `apps/web/e2e/eval-three-surfaces.spec.ts` | UI shows the same slug, marker, and repository path string as the CLI | **To author** |
| `apps/core/tests/eval/eval-three-surfaces.test.ts` | Field-set parity across chat, CLI, and REST for one entity | **To author** |

## Pass

- Binary: oracles hold for chat, CLI, API, and web content.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Model / provider | — |
| Wall clock | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

[BOARD F-001](results/BOARD.md) is resolved (2026-09-23). Record it again only if a fresh run shows
the container still cannot be created from chat.
