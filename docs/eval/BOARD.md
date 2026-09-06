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
| E-004 | 01-fresh-start | Web inventory only smoke-checked (HTTP 200), not same ids/names as CLI | U3: operator UI must show the same project/agent inventory as chat/CLI after inspect | web / docs | eval-suite-01 | resolved | Playwright `eval-fresh-start.spec.ts` + HTML assert on `/` and `/agents`; re-run `01c` |
| E-005 | 01-fresh-start | Pending question from follow-up not verified in web UI; no fresh re-run after later lifts | Soft P3 + U5: question visible in UI; re-run empty data dir before reclaiming 10 | web / ops | eval-suite-01 | resolved | Question on dashboard HTML + e2e answer path; fresh dir `~/.kampaku-eval-01c` |
| E-006 | 01-fresh-start | LLM invents empty project list despite default `kampaku` project | Honest inventory: `list_projects` tool + prompt; richer `get_project` miss | core | eval-suite-01 | resolved | LLM re-run used `list_projects` and reported `kampaku` |
| E-007 | 02-three-surfaces | Kampaku could not set project note/name; emperor prompt dead-ended on advisor | Allow Kampaku `update_project` for name/description only; deny governance fields in runtime | core | eval-suite-02 | resolved | Operating model + catalog + deny-path tests |
| E-008 | 02-three-surfaces | Web project Save ignored textarea edits (stale onSave closure) | Detail panel Save/Cancel/Delete must read latest `getHandlers()` | web | eval-suite-02 | resolved | Header actions fix + unit + e2e |
| E-009 | 03-standing-team | No staff-only path for new project team without submit_intent/work items | `staff_project_team` creates project+lead+nested specialists+lead link without jobs | core | eval-suite-03 | resolved | LLM + stub + unit + e2e; kampaku tool allowlist |
| E-010 | end-of-arc (after 01–18 green) | Lab fixtures leaked into product tools/skills (Hello Eval names/templates; scenario defaults; skill fragments that bake demo stacks) | **End-of-arc cleanup:** generalize all Kampaku tools + related skills to durable **product verbs** and generic contracts; move scenario copy (Hello Eval, SMS, etc.) only into suite stubs/prompts/args; then **re-run the full eval arc** (unit + e2e + fresh LLM where claimed) and re-score suites that rename surfaces | core / contracts / docs | eval-suite-01 | open | **Non-blocking** while suites run. Do not proliferate fixture-named tools meanwhile. See checklist below. Partial: `ask_blocking_question` already generic (2026-09-06). |

## E-010 end-of-arc checklist

Close only when **all** hold:

1. **Tools (rename/generalize)** — at least:
   - `execute_hello_eval_plan` → product verb (e.g. execute approved plan / go-ahead)
   - `propose_project_plan` template no longer Hello Eval–only (intent/args drive the plan shape)
   - `publish_shared_knowledge` inspects disk generically (not Hello Eval string cues as the only truth)
   - Confirm `bootstrap_stranger_project`, `ask_blocking_question`, and any later arc tools stay free of suite-demo defaults
2. **Skills / prompts** — catalog fragments and `kampaku.agent.json` describe product verbs; suite scenarios stay in eval stubs/docs, not skill JSON as hard requirements
3. **Tests** — update unit + Playwright that assert old tool names; keep oracle product-level (disk, jobs, questions, wiki)
4. **Re-test** — fresh data-dir regress of **all green suites 01…N** (stub automated + claimed LLM paths); fix any drift; mark each suite re-scored
5. **Docs** — BOARD/LEARNINGS/suite soft notes point at the new verbs; remove “temporary Hello Eval executor” language from product claims

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
