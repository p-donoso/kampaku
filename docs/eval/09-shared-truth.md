# 09 — Shared truth

## Promise tested

After meaningful work, the project knowledge the emperor can read matches what is on disk, and
anything not built is labeled as future.

## Why it elevates

Weak: the wiki claims features that do not exist; a proposal is presented as published; default pages
document commands the project cannot run; the "roadmap" section describes yesterday's plan as today's
reality.

Credible: published knowledge is evidence-backed, pending proposals are clearly pending, and an
unbuilt feature is labeled future rather than described in the present tense.

## Prereqs

- Suite [08](08-hands-off-execution.md) produced real files in the project (or re-run after producing
  one honest fact).
- The project has a discoverable toolchain, so the knowledge can be checked against real commands.

## Emperor prompts

1. `Update the project's shared knowledge so it reflects what is actually implemented. Mark anything not built as future. Do not invent libraries, endpoints, or commands.`
2. `Point me to the pages I should read as the emperor, and tell me which of them are proposals rather than published.`
3. `Add a page describing the scheduled-reminders feature we will build next quarter. Do not implement it.`

## Oracle

- Published knowledge matches the project tree and its actual commands.
- Unimplemented items are labeled future or planned — not present tense.
- Pending versus published is explicit where the product uses proposals; a pending proposal is never
  described as live.
- Every command mentioned in published pages runs in the project, or the page states it does not.
- Prompt 3 produces a **proposal**, not a published page, and the page is clearly marked as unbuilt.
  A page that describes a nonexistent feature in the present tense fails this suite.
- The knowledge update creates no jobs and marks no work done.
- Language: durable artifacts are English (see [00-protocol.md](00-protocol.md) § Language).
- If the product links knowledge to work items, at least one link resolves to a real work item with
  evidence.

## How to measure

- List published pages vs pending proposals via the public surface.
- For each command in each published page, run it and record the result.
- Search published pages for present-tense claims about features with no corresponding code.
- Confirm no jobs or closures were created by the knowledge beat.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Pages and proposal states agree on chat, CLI, and web
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Knowledge concerns software
- [ ] F2 Commands in published pages come from the project's toolchain
- [ ] F3 Knowledge describes the shape that exists
- [ ] F4 No existing documentation overwritten without reason
- [ ] F5 Published pages describe how to build or run the artifact

### Suite-specific

- [ ] Every command in published pages executed and recorded
- [ ] Unbuilt features labeled future
- [ ] Proposals distinguishable from published pages on every surface
- [ ] No jobs or closures from the knowledge beat
- [ ] Persisted content is English

### In-scope P-gates

- **P1** soft (no false completion) · **P5** required · **P3** if a proposal needs approval in the UI

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-shared-truth.test.ts` | Publishing derives content from disk; unbuilt items labeled future; proposals stay pending | **To author** |
| Wiki store and proposal tests | Proposal lifecycle, pending vs published | Exist; re-run and cite |

## Pass

- Binary: all oracle bullets hold.
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

None beyond prior suites.
