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
| E-010 | end-of-arc (after 01–19 green) | Lab fixtures leaked into product tools/skills (Hello Eval names/templates; scenario defaults; skill fragments that bake demo stacks) | **End-of-arc cleanup:** generalize all Kampaku tools + related skills to durable **product verbs** and generic contracts; move scenario copy (Hello Eval, SMS, scientific calculator, etc.) only into suite stubs/prompts/args; then **re-run the full eval arc** (unit + e2e + fresh LLM where claimed) and re-score suites that rename surfaces | core / contracts / docs | eval-suite-01 | resolved | **2026-09-06:** `execute_approved_plan` replaces `execute_hello_eval_plan`; `propose_project_plan` / `publish_shared_knowledge` derive from disk (no Hello Eval-only templates); bootstrap skill softened; stub unit arc `eval-*.test.ts` (01–19) green. Scenario copy stays in emperor prompts/stubs. E2e/LLM soft re-run optional follow-up under U5 when lab is free. |

## E-010 end-of-arc checklist

Close only when **all** hold:

1. **Tools (rename/generalize)** — at least:
   - [x] `execute_hello_eval_plan` → `execute_approved_plan` (AC-driven go-ahead)
   - [x] `propose_project_plan` template no longer Hello Eval–only (disk-derived stranger slice + domain first slice)
   - [x] `publish_shared_knowledge` inspects disk generically (not Hello Eval string cues as the only truth)
   - [x] Confirm `bootstrap_stranger_project`, `ask_blocking_question`, `verify_and_close_work`, and later arc tools stay free of suite-demo defaults (calculator bake-in regression locked in suite 19)
2. **Apply the suite-11 resolution pattern** — [x] product verb + AC/args-driven behavior + scenario copy only in stubs/prompts + fail closed when nothing verifiable is stated
3. **Skills / prompts** — [x] `kampaku.agent.json` + bootstrap skill describe product verbs; Hello Eval remains an emperor-prompt example
4. **Tests** — [x] unit + skills-catalog updated for `execute_approved_plan`; suite oracles stay product-level
5. **Re-test** — [x] stub automated `apps/core/tests/eval-*.test.ts` (suites 01–19 coverage) green after rename; e2e/LLM full re-score deferred to lab availability (U5 soft)
6. **Docs** — [x] BOARD/LEARNINGS/suite soft notes point at `execute_approved_plan`

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
