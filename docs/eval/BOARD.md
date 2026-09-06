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
| E-002 | 01-fresh-start | Blank `KAMPAKU_WORKSPACE=` would bind empty workspaceRoot | Treat blank env as unset; document verify steps | core / docs | eval-suite-01 | resolved | `loadConfig` + config test |
| E-003 | 01-fresh-start | Advisor 10 claimed without suite-locked automated tests | 10/10 requires tests; add eval-fresh-start coverage; document testing gate | core / docs | eval-suite-01 | resolved | Rule in eval README/00-protocol; `eval-fresh-start.test.ts` |
| E-004 | 01-fresh-start | Web inventory only smoke-checked (HTTP 200), not same ids/names as CLI | U3: operator UI must show the same project/agent inventory as chat/CLI after inspect | web / docs | — | open | Blocks advisor 10; need UI assert or Playwright |
| E-005 | 01-fresh-start | Pending question from follow-up not verified in web UI; no fresh re-run after later lifts | Soft P3 + U5: question visible in UI; re-run empty data dir before reclaiming 10 | web / ops | — | open | Blocks suite green |

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
