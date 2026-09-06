# 03 — Standing team

## Promise tested

When the emperor asks for people for a piece of work, a comprehensible team appears with clear ownership — not orphan agents.

## Why it elevates

Weak: flat list of agents under the root, duplicate leads, or roles nobody owns. Credible: a human can say who is accountable and who reports to whom in under a minute.

## Prereqs

- Suites 01–02 pass on this instance (or fresh re-run).
- Have a project id from suite 02 or create one only if the emperor prompt below requires it.

## Emperor prompts

1. `I need a standing team for project work named eval-team-demo: one accountable lead and specialists for frontend, backend, and quality. Show me the hierarchy when done. Do not start coding yet.`

Do not paste internal recipe names. Judge the outcome, not whether a catalog recipe was followed.

If the advisor cannot create the roster itself, it must ask or route — not invent a second project lead by silently rewriting governance fields. (Suite 02 allows advisor **name/description** only; lead assignment stays a lead/governance path — proven further in suite 04.)

## Oracle

- A lead (or single accountable owner) is identifiable for that project.
- Specialists are nested under that owner or otherwise clearly scoped to the project — not anonymous peers with no parent story.
- No duplicate conflicting leads for the same project.
- Hierarchy is visible in chat and in CLI/web agent views.
- No execution jobs started solely from this staffing request.
- After staffing, project lead field (if exposed) matches the named accountable owner — not a silent advisor-only swap without emperor/lead path.

## How to measure

- Agent tree / list via public CLI and web.
- Project detail shows who leads it (if the product exposes that field).
- Count jobs/work items before/after; should not jump for "staff only".

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent tool-budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [ ] Lead/owner identifiable; specialists nested or clearly scoped (no orphans)
- [ ] Hierarchy visible in chat, CLI, and web
- [ ] Staffing-only prompt does not start execution jobs
- [ ] Automated tests lock hierarchy + no-exec-on-staff

### In-scope P-gates

- None required beyond U-gates

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| _TBD — add before claiming 10_ | Suite promise regression |

Without committed tests, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: __ / 10
- Suite green only at **10** with U1–U8 + suite-specific + in-scope P-gates + automated tests.

## Run log

| Field | Value |
|-------|-------|
| Date | |
| Data dir | |
| Git SHA | |
| Model / provider | |
| Wall clock | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
