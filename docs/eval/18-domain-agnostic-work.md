# 18 — Domain-agnostic work

## Promise tested

Kampaku staffs and plans with **one domain-agnostic path**: an adequate team that covers the aspects of the emperor's work — without a baked software roster, without a baked writing roster, and without a product fork of “software vs non-software.”

## Why it elevates

Weak: every project becomes a six-role software team; novels get `*-frontend`; the product invents a parallel “writing agents” recipe. Credible: the emperor states the work; Kampaku asks for (or takes) roles that cover that domain; plans use verifiable acceptance in that vocabulary.

## Prereqs

- Suites **01–03** green (inventory, three surfaces, staffing ask-first).
- Prefer **05** started or green so intent clarification exists.
- Suite **17** optional but useful for LLM path honesty.

## Emperor prompts

1. `I am writing a novel, not software. For project my-first-novel, build an adequate standing team that covers all aspects and propose the first slice of work. Do not invent engineering roles. Do not start writing the manuscript yet.`
2. If asked for roles, answer with any adequate set for that domain (example only): `Lead plus plotting, prose, and continuity. No frontend or backend.`
3. Soft contrast: `Now improve the kampaku platform project only — keep that team's software shape. Do not rewrite my-first-novel into engineers.`

Soft note from suite **05**: vague improve must clarify next intent — not silently staff or plan a default engineering team.

## Oracle

- Without named roles, Kampaku asks for an adequate role set — it does **not** invent `frontend`/`backend`/`qa`, and it does **not** invent a product-default writing team either.
- When the emperor names roles, specialists match those roles (scenario example roles are emperor-provided, not a catalog).
- First-slice / plan acceptance uses domain-agnostic verifiable checks — not mandatory npm/CI/OpenAPI unless the emperor asked for an engineering stack.
- Platform/`kampaku` software team shape is unchanged by staffing another project.
- `create_missing_agents` must not auto-seed the six-role software template onto a domain project.
- Chat, CLI, and web agree on the project lead and specialist slugs.

## How to measure

- After prompts: `kampaku agents tree` and project lead fields for `my-first-novel` and `kampaku`.
- Confirm no invented engineering specialists when the emperor forbade them.
- Snapshot agent slugs before/after prompt 3 on both projects.
- Automated tests: ask-first without inventing engineers; emperor-named roles staff as-is; recipe non-overwrite; arbitrary role suffixes get least-privilege skills; software eval-team still works when named.

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [x] U1 Empty instance
- [x] U2 Public docs sufficient
- [x] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level (do not require skill slug names)
- [x] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [x] Adequate-team / first-slice ask does not invent a default engineering roster
- [x] Emperor-named roles staff as-is (no software/writing product fork)
- [x] Plan language stays domain-agnostic (no mandatory CI/npm AC unless asked)
- [x] Automated tests lock ask-first + recipe non-overwrite + arbitrary specialist skills

### In-scope P-gates

- Soft **P6** when a plan is produced — cold reader should understand the plan without assuming a repo

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| [`apps/core/tests/eval/eval-domain-agnostic-work.test.ts`](../../apps/core/tests/eval/eval-domain-agnostic-work.test.ts) | Adequate-team ask-first; emperor-named roles + domain-agnostic first slice; no six-role seed; arbitrary role skills; soft contrast |
| [`apps/core/tests/eval/eval-standing-team.test.ts`](../../apps/core/tests/eval/eval-standing-team.test.ts) | Suite 03 staffing tool regression |

Without committed tests, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10
- Suite green only at **10** with U1–U8 + suite-specific + in-scope P-gates + automated tests.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | vitest tmp (`/tmp/kampaku-eval-domain-*`) |
| Git SHA | local (pre-commit; suite 18 uncommitted) |
| Model / provider | stub automated |
| Wall clock | ~3s unit |
| Tests | `eval-domain-agnostic-work.test.ts` + standing-team / delegator regressions |

## Result

`pass` — advisor **10**/10 (product + tests; **not committed**). One agnostic staffing/planning path: ask for adequate roles, staff emperor-named roles, first-slice AC without invented engineering stack; no writing-agent product fork.

## Evidence

- Adequate-team prompt asks for roles; does not create `*-frontend` or a default writing roster.
- Emperor-named roles staff as-is; first work slice uses deliverable/acceptance-check language.
- `create_missing_agents` does not seed six-role software roster.
- Arbitrary specialist suffixes get workflow skills; named software teams still work.

## Blocker

None.
