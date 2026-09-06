# 18 — Domain-agnostic work

## Promise tested

Kampaku orchestrates **non-software** work with the same clarity as software work: domain-shaped teams, plans, and acceptance language — without forcing a frontend/backend/qa recipe or inventing a fake engineering stack.

## Why it elevates

Weak: every project becomes a six-role software team; novels get `*-frontend`; bootstrap recipes demand git/CI/npm. Credible: the emperor states a domain; the product asks for missing roles, staffs and plans in that domain's vocabulary, and keeps software recipes for software work only.

## Prereqs

- Suites **01–03** green (inventory, three surfaces, staffing ask-first).
- Prefer **05** started or green so intent clarification exists.
- Suite **17** optional but useful for LLM path honesty.

## Emperor prompts

1. `I am writing a novel, not software. For project my-first-novel, propose a standing team and the first slice of work. Do not invent engineering roles. Do not start writing the manuscript yet.`
2. If asked for roles, answer: `Lead plus plotting, prose, and continuity. No frontend or backend.`
3. Soft contrast: `Now improve the kampaku platform project only — keep that team's software shape. Do not rewrite my-first-novel into engineers.`

Soft note from suite **05**: vague improve on a novel project must clarify domain next-intent — not silently staff or plan a six-role software team.

## Oracle

- Novel project specialists are writing/editing roles (or the emperor-named roles) — **not** `frontend`/`backend`/`qa` unless the emperor asked for those.
- Clarifying questions and plans use domain language (chapters, draft, continuity) — not mandatory npm/CI/OpenAPI acceptance for the novel.
- Platform/`kampaku` software team shape is unchanged by the novel staffing (no cross-contamination).
- Catalog or bootstrap recipes must not silently re-staff the novel project into the mandatory six-role software template during this run.
- Chat, CLI, and web agree on the novel project's lead and specialist slugs.

## How to measure

- After prompts: `kampaku agents tree` and project lead fields for `my-first-novel` and `kampaku`.
- Read clarifying questions / plan text for engineering leakage (`npm test`, `OpenAPI`, `frontend`) on the novel track.
- Snapshot agent slugs before/after prompt 3 on both projects.
- Automated tests: staffing + recipe deny path for non-software domains; software path still works for platform/eval software projects.

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent tool-budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level (do not require skill slug names)
- [ ] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [ ] Non-software staffing/plan does not invent engineering roles
- [ ] Software recipes remain available for software projects without contaminating the novel project
- [ ] Intent/plan language matches domain (no mandatory CI/npm AC on novel leaves)
- [ ] Automated tests lock domain staffing + recipe non-overwrite

### In-scope P-gates

- Soft **P6** when a plan is produced — cold reader should understand a novel plan without assuming a repo

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| _TBD — extend standing-team + add recipe/intent regression_ | Novel roles; vague ask-first; software eval-team still works; roster/bootstrap must not force six-role software onto a novel project |

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
| Tests | |

## Result

`pass` / `fail` / `blocked` / `deferred` —

## Evidence

## Blocker

Owns the deep software-bias gap left after suite 03 staffing fix. See [LEARNINGS.md](LEARNINGS.md).
