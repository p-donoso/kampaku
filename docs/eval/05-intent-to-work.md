# 05 — Intent to work

## Promise tested

A vague request triggers clarification or disambiguation **before** flooding the work board with duplicate or invented tracks.

## Why it elevates

Weak: twenty tasks appear from "make it better". Credible: questions first, or a single coherent proposal awaiting confirmation.

## Prereqs

- Suites 01–04 pass.
- Prefer an existing project; do not start a large greenfield yet (suite 06).

## Emperor prompts

1. `Improve the project. Make it better. Start now.`
2. Only if asked a clear question, answer minimally: `Clarify first; do not create more than one proposal track until I confirm.`
3. Soft check: a staffing-only request must not flood the board — staff via the standing-team path (suite 03), not a large intent tree. Prefer stop language like "do not start execution yet" over assuming all work is coding.

## Oracle

- Within the first response cycle, the system asks clarifying questions **or** presents a short options set — before creating a large work tree.
- Work board does not explode with duplicate root tracks for the same vague intent.
- If work is created without confirmation, suite fails unless the product can show the emperor already approved an equivalent intent earlier in this data dir (should not apply on empty-path runs).
- When inspect already shows a healthy default project and team, clarifying questions must **not** invent missing foundation (fake "no repo / no vision / no CI") as if the instance were empty. Ask about **next** intent, not phantom bootstrap gaps.
- Intent clarification must not silently staff or rewrite a non-software project into a mandatory software six-role team (deepen in suite 18).

## How to measure

- Count work items / goals before and after the first vague prompt (public CLI/UI).
- Capture the clarifying questions shown to the emperor (chat and pending-questions UI if any).
- Note whether execution started without a confirmed scope.

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [x] U1 Empty instance
- [x] U2 Public docs sufficient
- [x] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [x] Vague intent triggers clarify/options **before** board flood
- [x] No duplicate root tracks from one vague prompt
- [x] No invented "missing foundation" when default project/team already exist
- [x] Staffing-only vs intent paths stay distinct (no silent board flood from staff)
- [x] Automated tests lock clarify-before-delegate / no silent flood

### In-scope P-gates

- None beyond U-gates

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| `apps/core/tests/eval-intent-to-work.test.ts` | Vague improve → `intent-next-focus`; no work/staff; healthy first-run asks next intent not repo/six-role |
| `apps/web/e2e/eval-intent-to-work.spec.ts` | Chat clarify visible; work board count unchanged after answer |
| `apps/core/tests/eval-fresh-start.test.ts` (decide path) | Healthy-default decide uses next-intent clarify |

Without committed tests, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10
- Suite green only at **10** with U1–U8 + suite-specific + in-scope P-gates + automated tests.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | `~/.kampaku-eval-05` |
| Git SHA | `4e6b082` (+ suite 05 WIP) |
| Model / provider | `nvidia/nemotron-3-super-120b-a12b` via FreeLLMAPI |
| Wall clock | ~40s for prompts 1–2 + soft staff |
| Work items before / after | `0` / `0` (prompts 1–2); soft staff `0` work items |

## Result

`pass` — advisor **10**/10. LLM vague improve asked a single-choice focus question (`list_projects` only); follow-up still clarify-only; soft staffing used `staff_project_team` with zero work items. Stub + unit + e2e lock the promise; regress 01–04 green.

## Evidence

- Prompt 1: options question; work items stayed 0.
- Prompt 2: next-intent choice; work items stayed 0.
- Soft: `eval-intent-soft` staffed hierarchy; `workItems=[]`.
- Tests: vitest `eval-intent-to-work` + Playwright; 01 decide path updated to `intent-next-focus`.

## Blocker

None.
