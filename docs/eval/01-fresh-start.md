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

- [x] U1 Empty instance — `/home/pdonoso/.kampaku-eval-01c`
- [x] U2 Public docs sufficient — README verify path updated
- [x] U3 Chat + CLI + web agree on ids/fields — project `kampaku`, lead `kampaku-manager`, standing team; pending question text on dashboard HTML
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after fixes — `01c` with `list_projects` honesty fix
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite — E-004 / E-005 resolved

### Suite-specific (must all be yes for 10)

- [x] Inspect prompt does not mutate projects/agents/work items
- [x] Chat inventory matches CLI/API
- [x] Same inventory names/ids visible in **web UI content** (not status code only)
- [x] Follow-up pending question visible in operator UI (if emitted)
- [x] Automated tests lock bootstrap + inspect non-mutation + blank env

### In-scope P-gates

- Soft preview of **P3** when follow-up asks a question — UI visibility required for 10

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| [`apps/core/tests/eval-fresh-start.test.ts`](../../apps/core/tests/eval-fresh-start.test.ts) | Empty-dir bootstrap → health, default project, lead + nested specialists; inspect chat does not mutate; `list_projects` + honest `get_project` miss |
| [`apps/core/tests/config.test.ts`](../../apps/core/tests/config.test.ts) | Blank env values do not break workspace boot |
| [`apps/web/e2e/eval-fresh-start.spec.ts`](../../apps/web/e2e/eval-fresh-start.spec.ts) | Dashboard + agents page inventory labels; stub inspect chat; pending question answerable on dashboard |

## Pass

- Binary: oracles hold for chat / CLI / API / web content.
- Advisor score: **10** / 10
- Suite **green**.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 (fresh re-run `01c`) |
| Data dir | `/home/pdonoso/.kampaku-eval-01c` |
| Git SHA | `8c444f6` + local honesty/e2e fixes (pre-commit) |
| Model / provider | FreeLLMAPI `auto` → `nvidia/nemotron-3-super-120b-a12b` |
| Wall clock | ~20s inspect · ~10s decide |
| Tests | `eval-fresh-start.test.ts` 5/5 · Playwright `eval-fresh-start.spec.ts` 3/3 · `config.test.ts` |

## Result

`pass` — advisor **10**/10. Inspect used `list_projects` + `list_agents` + `get_project` and reported project `kampaku` honestly; counts stayed projects=1 / agents=9 / work_items=0; pending question visible in CLI and dashboard HTML; automated unit + e2e coverage cited.

## Evidence

- LLM reply: one active project slug `kampaku`, full team tree under `kampaku-manager`, no open work, no mutations.
- Tools: `list_projects`, `list_agents`, `get_project`.
- Web `/` and `/agents` HTML contain `kampaku`, `kampaku-manager`, specialists; pending question prompt on dashboard.
- Playwright e2e green on stub Core (ports 18080/13002) with empty data dir.

## Blocker

None for suite 01. See `BOARD.md` (E-004 / E-005 resolved).
