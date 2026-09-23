# 02 — Three surfaces

> Historical oracle (superseded 2026-09-11). The current product contract is Kampaku as the emperor's orchestrator; see `apps/core/tests/eval/eval-orchestrator-contract.test.ts`, case 02.

## Promise tested

Conversation, CLI, and web show the same truth for the same resource after one trivial mutation.

## Why it elevates

Weak: chat claims success while CLI is stale, or web cannot perform an action CLI can. Credible: one mutation, three consistent views; no orphan surface.

## Prereqs

- Prefer suite 01 **green (10/10)**; if 01 is below 10 only for UI/e2e gaps, this suite may still run to close U3.
- Stack up per [00-protocol.md]../00-protocol.md.

## Emperor prompts

1. `Pick one existing project or create the smallest placeholder project if none exists. Then set a short note or display name I can recognize: EVAL-SURFACE-MARKER. Confirm the id.`
2. After chat succeeds: verify via CLI and open the same entity in the web UI. Do not ask the model to "fix" a mismatched surface.
3. Optional: mutate the description once via CLI/API, then ask chat to confirm the new value and id.

If the product refuses creation without approval, answer the approval once, then continue measurement.

## Oracle

- One durable entity carries `EVAL-SURFACE-MARKER` (or equivalent visible field).
- Chat, CLI, and web report the same id and the same marker.
- No surface is missing the entity while another shows it.
- A failed surface is a suite fail, not "use CLI only".
- After a CLI/web mutation, a **fresh chat turn** (real provider preferred) reports the new marker — not a pre-mutation invention. Stub-only proof of this bullet is weak; deepen under [17-provider-fidelity.md](17-provider-fidelity.md) if provider path is deferred.

## How to measure

- Capture id from chat.
- Query the same id via public CLI.
- Open the entity in web; confirm marker text.
- Optional: mutate the marker once via CLI and confirm chat/web catch up without a second invent.

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [x] U1 Empty instance — `/home/pdonoso/.kampaku-eval-02`
- [x] U2 Public docs sufficient
- [x] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite — E-007 / E-008 resolved

### Suite-specific (must all be yes for 10)

- [x] Marker visible with **same id** in chat, CLI, and web UI content (not HTTP 200 only)
- [x] Mutating on one surface updates the other two without inventing a second entity
- [x] Automated tests cover parity (API ↔ persisted field at minimum; UI e2e preferred)

### In-scope P-gates

- None beyond U3 (this suite *is* the three-surface gate)

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| [`apps/core/tests/eval/eval-three-surfaces.test.ts`](../../apps/core/tests/eval/eval-three-surfaces.test.ts) | PATCH description; Kampaku chat sets marker; governance deny; post-CLI chat confirm |
| [`apps/core/tests/persistence/skills-catalog.test.ts`](../../apps/core/tests/persistence/skills-catalog.test.ts) | Kampaku may `update_project`; still denied work/roster mutators |
| [`apps/web/e2e/eval-three-surfaces.spec.ts`](../../apps/web/e2e/eval-three-surfaces.spec.ts) | Chat→web id/marker; web edit Save persists |
| [`apps/web/tests/components/detail-panel-header-actions.test.tsx`](../../apps/web/tests/components/detail-panel-header-actions.test.tsx) | Save uses latest registered onSave (no stale draft) |

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10
- Suite **green**.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | `/home/pdonoso/.kampaku-eval-02` |
| Git SHA | `e730fb0` + suite-02 product fixes (pre-commit) |
| Model / provider | FreeLLMAPI → `nvidia/nemotron-3-super-120b-a12b` |
| Wall clock | ~10s set · ~7s confirm after CLI mutate |
| Entity id | `e10ea79a-4187-4b20-a255-c004d6f8ffde` |
| Tests | `eval-three-surfaces` 4/4 · Playwright 2/2 · panel header 3/3 · skills-catalog |

## Result

`pass` — advisor **10**/10. Chat `update_project` set marker and confirmed id; CLI/API/web matched; after CLI description change to `EVAL-SURFACE-MARKER-CLI`, fresh chat + web roster showed the same id and value.

## Evidence

- LLM tools: `list_projects`, `update_project` then `get_project` on confirm.
- CLI `kampaku projects show kampaku` and API overview shared id + description.
- Web `/projects` and `?open=kampaku` HTML contained the CLI marker and id.
- Product: Kampaku metadata mutation allowed; detail-panel Save stale-handler fixed.
- Regression: suite **01** unit + e2e still green in the same window as suite 02 (15 unit across 01/02/catalog/config; Playwright 5/5 for `eval-fresh-start` + `eval-three-surfaces`).

## Blocker

None for suite 02. See `../results/BOARD.md` / `results/LEARNINGS.md`.
