# 03 — Standing team

> Historical oracle (superseded 2026-09-11). Kampaku no longer creates standing teams directly; see the current advisor contract, case 03.

## Promise tested

When the emperor asks for people for a piece of work, a comprehensible team appears with clear ownership — not orphan agents.

## Why it elevates

Weak: flat list of agents under the root, duplicate leads, or roles nobody owns. Credible: a human can say who is accountable and who reports to whom in under a minute.

## Prereqs

- Suites 01–02 pass on this instance (or fresh re-run).
- Have a project id from suite 02 or create one only if the emperor prompt below requires it.

## Emperor prompts

1. `I need a standing team for project work named eval-team-demo: one accountable lead and specialists for frontend, backend, and quality. Show me the hierarchy when done. Do not start coding yet.`
2. Domain check (same suite): `I want to write a novel. Staff a standing team for project work named my-first-novel. Show the hierarchy. Do not start writing yet.`  
   - If roles were not named, the product must **ask** for domain-appropriate roles — not invent `frontend`/`backend`/`qa`.  
   - Follow-up once roles are named (e.g. plotting, prose, continuity): staff and show hierarchy.

Do not paste internal recipe names. Judge the outcome, not whether a catalog recipe was followed.

If the advisor cannot create the roster itself, it must ask or route — not invent a second project lead by silently rewriting governance fields. (Suite 02 allows advisor **name/description** only; lead assignment for staffing uses the dedicated staffing path — proven further in suite 04 for unauthorized governance.)

## Oracle

- A lead (or single accountable owner) is identifiable for that project.
- Specialists are nested under that owner or otherwise clearly scoped to the project — not anonymous peers with no parent story.
- No duplicate conflicting leads for the same project.
- Hierarchy is visible in chat and in CLI/web agent views.
- No execution jobs started solely from this staffing request.
- After staffing, project lead field (if exposed) matches the named accountable owner — not a silent advisor-only swap without emperor/lead path.
- Specialist role suffixes match the **emperor's domain** (software vs novel/writing/other). Inventing a software team for non-software work is a fail.

## How to measure

- Agent tree / list via public CLI and web.
- Project detail shows who leads it (if the product exposes that field).
- Count jobs/work items before/after; should not jump for "staff only".

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [x] U1 Empty instance — `/home/pdonoso/.kampaku-eval-03`
- [x] U2 Public docs sufficient
- [x] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite — E-009 resolved

### Suite-specific (must all be yes for 10)

- [x] Lead/owner identifiable; specialists nested or clearly scoped (no orphans)
- [x] Hierarchy visible in chat, CLI, and web
- [x] Staffing-only prompt does not start execution jobs
- [x] Domain-shaped roles (no invented software team for non-software work)
- [x] Automated tests lock hierarchy + no-exec-on-staff + domain roles / ask-first

### In-scope P-gates

- None required beyond U-gates

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| [`apps/core/tests/eval/eval-standing-team.test.ts`](../../apps/core/tests/eval/eval-standing-team.test.ts) | Nested lead+specialists; lead link; idempotent; conflicting lead deny; stub chat; novel roles; vague novel asks; `get_project` lead slug; no work items |
| [`apps/core/tests/persistence/skills-catalog.test.ts`](../../apps/core/tests/persistence/skills-catalog.test.ts) | Kampaku has `staff_project_team`; still denied free-form roster/work mutators |
| [`apps/web/e2e/eval-standing-team.spec.ts`](../../apps/web/e2e/eval-standing-team.spec.ts) | Chat staffing → agents + projects UI hierarchy |

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10
- Suite **green**.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | `/home/pdonoso/.kampaku-eval-03` |
| Git SHA | `fe4a872` + suite-03 product (pre-commit) |
| Model / provider | FreeLLMAPI → `nvidia/nemotron-3-super-120b-a12b` |
| Wall clock | ~30s staffing turn |
| Project id | `8555d649-e3ee-498c-a291-35adf8bce732` |
| Tests | standing-team 4/4 · Playwright 01–03 = 6/6 · catalog + prior suites unit green |

## Result

`pass` — advisor **10**/10. LLM called `staff_project_team` + `list_agents`; hierarchy nested under `eval-team-demo-lead`; project lead linked; work items 0; CLI tree and web `/agents` + `/projects?open=` showed the same slugs.

## Evidence

- Tools: `staff_project_team`, `list_agents`.
- Specialists' `parentId` = lead id; lead parent = kampaku builtin.
- Regression: suites 01–02 unit + e2e still green with suite 03 tests in the same window.
- Domain elevation: vague novel staffing must ask for roles (not invent frontend/backend/qa); named novel roles staff correctly.

## Blocker

None for suite 03.
