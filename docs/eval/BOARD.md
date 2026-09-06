# Eval board (product gaps)

Open gaps found while running `docs/eval` suites. Language is **product gap**, not catalog patch.

## Status legend

- `open` — blocks or fails a suite
- `in_progress` — a chat owns the fix
- `resolved` — fixed; suite re-run on fresh data dir still required before calling the suite green
- `wontfix` — accepted debt; suite remains fail until bar changes with emperor approval

## Columns

| id | suite | symptom | product gap | likely layer | owner chat | status | notes |
|----|-------|---------|-------------|--------------|------------|--------|-------|
| E-001 | 01-fresh-start | Root README said stub defaults while `.env.example` used `llm` | Public start docs must match real defaults and call out absolute data dir / FreeLLMAPI | docs | eval-suite-01 | resolved | Fixed README + `.env.example`; suite 01 |
| E-002 | 01-fresh-start | Blank `KAMPAKU_WORKSPACE=` would bind empty workspaceRoot | Treat blank env as unset; document verify steps; suite green only at advisor 10 | core / docs | eval-suite-01 | resolved | `loadConfig` + config test + README verify; advisor 10/10 |

## How to add a row

1. `id`: `E-001`, `E-002`, …
2. `suite`: file stem (`01-fresh-start`, …)
3. `symptom`: what the operator saw
4. `product gap`: what a credible harness would do instead
5. `likely layer`: core / worker / web / contracts / docs / ops (best guess; not a skill slug)
6. `owner chat`: short label of the agent chat closing it
7. `status`: see legend
8. `notes`: links to evidence paths, PRs, or suite run dates

## Dependency rule

Do not start suite N if an `open` board row for suites &lt; N is marked as blocking that path. Prefer closing gaps in order.
