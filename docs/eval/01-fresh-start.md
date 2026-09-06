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
- Compare chat summary to CLI list/status commands and web home/projects/agents views.
- Snapshot counts before/after the chat turn (projects, agents, work items) via public CLI.

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| [`apps/core/tests/eval-fresh-start.test.ts`](../../apps/core/tests/eval-fresh-start.test.ts) | Empty-dir bootstrap → health, default project, lead + nested specialists; inspect chat does not mutate projects/agents/work |
| [`apps/core/tests/config.test.ts`](../../apps/core/tests/config.test.ts) | Blank env values do not break workspace boot |

Without these (or equivalent) passing in CI/local, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10 — only valid because automated tests above exist and pass; suite green requires 10 **with testing**.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | `/home/pdonoso/.kampaku-eval-01` |
| Git SHA | see `feature/eval-suite-01` after testing-gate commit |
| Model / provider | FreeLLMAPI `auto` → `nvidia/nemotron-3-super-120b-a12b:free` |
| Wall clock | ~28s chat total (two turns) |
| Tests | `npm test -- tests/eval-fresh-start.test.ts tests/config.test.ts` (apps/core) |

## Result

`pass` — Advisor **10/10**. Manual inventory matched CLI/API/web with no mutation from inspect prompts; **and** automated tests lock bootstrap + inspect non-mutation + blank-env safety.

## Evidence

- Manual: fresh data dir boot; `GET /health` 200; web `:3002` 200; projects=1, agents=9, work_items=0 before/after inspect; pending question on follow-up only.
- Automated: `eval-fresh-start.test.ts` + `config.test.ts` green.
- Docs: README verify steps; `.env.example` does not set blank `KAMPAKU_WORKSPACE`.

## Blocker

None.
