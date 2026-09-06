# 01 — Fresh start

## Promise tested

A stranger can bring Kampaku up from public docs, ask what exists, and get an honest inventory without silent mutation.

## Why it elevates

Weak: README lies; first chat invents a project or mutates state while "inspecting". Credible: documented boot works; inspection answers match CLI/UI; no side effects from a read-only question.

## Prereqs

- Follow [00-protocol.md](00-protocol.md) to an empty data dir and running stack.
- No prior suites required.

## Emperor prompts

Paste into chat (Spanish or English):

1. `Are we ready? What exists here — projects, team, open work? Do not change anything.`
2. Optional follow-up: `If something is missing for a first run, tell me what I must decide. Do not create it yet.`

## Oracle

- Public start path from the root README succeeded (or failure is recorded as product gap).
- Health/status is reachable.
- Chat reply describes reality: either a default project/team, or an explicit empty state plus a clear ask — not fiction.
- After the prompts, no new projects, agents, work items, or repo files appeared that the emperor did not request.
- The same inventory is visible in CLI and web (names/IDs match).

## How to measure

- Run the README start commands; note failures.
- Hit operator health/status.
- Compare chat summary to CLI list/status commands and web home/projects/agents views **including visible names/ids**, not HTTP status alone.
- Snapshot counts before/after the chat turn (projects, agents, work items) via public CLI.
- If follow-up emits a pending question: confirm it appears in CLI **and** operator UI (human-gate preview for later suites).

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [x] U1 Empty instance — `/home/pdonoso/.kampaku-eval-01`
- [x] U2 Public docs sufficient — README verify path updated
- [ ] U3 Chat + CLI + web agree on ids/fields — **gap**: web checked as HTTP 200 only; project slug/id and agent tree not confirmed in UI content
- [x] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix — **gap**: no full empty re-run after testing-gate + checklist lift commits
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite — see E-004 / E-005 below

### Suite-specific (must all be yes for 10)

- [x] Inspect prompt does not mutate projects/agents/work items
- [x] Chat inventory matches CLI/API
- [ ] Same inventory names/ids visible in **web UI content** (not status code only)
- [ ] Follow-up pending question visible in operator UI (if emitted)
- [x] Automated tests lock bootstrap + inspect non-mutation + blank env

### In-scope P-gates

- Soft preview of **P3** when follow-up asks a question — UI visibility required for 10

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| [`apps/core/tests/eval-fresh-start.test.ts`](../../apps/core/tests/eval-fresh-start.test.ts) | Empty-dir bootstrap → health, default project, lead + nested specialists; inspect chat does not mutate |
| [`apps/core/tests/config.test.ts`](../../apps/core/tests/config.test.ts) | Blank env values do not break workspace boot |

Still missing for full U3/P3 lock: web e2e asserting project/agent labels and pending-question visibility.

Without those, advisor score remains capped below 10 even though core tests exist.

## Pass

- Binary: original oracles largely hold for chat/CLI/API (**partial** on web content parity).
- Advisor score: **8** / 10
- Suite **not green** under the full 10/10 standard (U3, U5, soft P3, web e2e missing).

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 (initial) · re-audit 2026-09-06 against full 10 bar |
| Data dir | `/home/pdonoso/.kampaku-eval-01` |
| Git SHA | `4bb94f1` era; re-audit on later checklist commits |
| Model / provider | FreeLLMAPI `auto` → `nvidia/nemotron-3-super-120b-a12b:free` |
| Wall clock | ~28s chat (two turns) |
| Tests | `eval-fresh-start.test.ts` + `config.test.ts` green |

## Result

`fail` for suite green (advisor **8**/10). Binary chat/CLI inspect behavior is strong; **not emperor-grade** until web inventory parity, pending-question UI check, fresh re-run after fixes, and preferably Playwright coverage close U3/P3.

## Evidence

- Strong: empty data dir; health 200; projects=1 / agents=9 / work_items=0 stable after inspect; CLI tree matches chat; core automated tests.
- Gaps vs 10 bar: web only smoke-loaded; no UI assertion of `kampaku` project id or agent names; follow-up question confirmed via CLI/API only; no fresh data-dir re-run after subsequent doc/test commits.

## Blocker

See `BOARD.md` **E-004**, **E-005**. Product gaps: operator UI must expose the same inventory ids as CLI after inspect; pending questions from chat must be visible in web; close with e2e + fresh re-run before reclaiming 10.
