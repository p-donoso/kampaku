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

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **8** / 10

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | `/home/pdonoso/.kampaku-eval-01` |
| Git SHA | `9b388c2` (+ README/.env.example honesty fix in follow-up commit) |
| Model / provider | FreeLLMAPI `auto` → `nvidia/nemotron-3-super-120b-a12b:free` |
| Wall clock | ~28s chat total (two turns) |

## Result

`pass` — Inventory matched CLI/API; no project/agent/work mutation from inspect prompts. Follow-up correctly asked for emperor decisions via a pending question without creating work.

## Evidence

- Boot: `kampaku bootstrap` then `./scripts/kampaku dev` → `GET /health` 200, web `:3002` 200.
- Before/after counts: projects=1 (`kampaku` / `07049933-4455-4380-8d0f-930e5c62362f`), agents=9, work_items=0.
- Chat turn 1 tools: `list_agents`, `get_project`; reported empty open work; hierarchy under `kampaku-manager`.
- Chat turn 2: pending question `fd646dca-bb04-4d81-a500-ef09f122b8f0` (`first-run-setup`) — visible via `kampaku questions list` and `/api/v1/questions`.
- CLI `kampaku agents tree` and `kampaku projects list` match chat; web `/`, `/agents`, `/projects` return 200.
- Host git tree not mutated by the inspect run.

## Blocker

None for binary pass. Closed product gap: root README claimed stub defaults while `.env.example` used `llm` — fixed in the companion commit so strangers are not misled.
