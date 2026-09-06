# 17 — Provider fidelity

## Promise tested

Under a **real model provider** (not stub-only), advisor answers about what exists stay faithful to tool results across wrong slugs, multiple projects, and a second turn after a mutation.

## Why it elevates

Weak: stub e2e is green while the LLM path invents empty inventories or ignores tool errors. Credible: provider path is part of the product bar; tool misses and inventories match CLI.

## Prereqs

- Suite **01** green (10/10), including stub automated tests.
- FreeLLMAPI (or documented public provider path) healthy.
- Prefer suite **02** green so three-surface mutation already exists.

## Emperor prompts

1. On a data dir with the default project: `List every project slug that exists. If none, say none. Do not invent.`
2. `Describe project slug not-a-real-project. What should I use instead?`
3. After creating or renaming a visible field via CLI (or after suite 02 marker): `What is the current marker or display note on that project? Include the project id. Do not guess.`

## Oracle

- Prompt 1 names the real slug(s) from CLI; does not claim zero projects when any exist.
- Prompt 2 does not invent a fake project; points at available slugs (or an explicit miss + inventory).
- Prompt 3 matches the post-mutation value **and id** from CLI/web — no stale invention.
- Counts of projects/agents/work items do not silently grow from these inspect turns.

## How to measure

- Run with `KAMPAKU_AGENT=llm` (or documented equivalent); record model id.
- Compare reply slugs/fields to `kampaku projects` / API and web labels.
- Snapshot counts before/after.
- Stub tests alone **do not** pass this suite.

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent tool-budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level (no required tool-slug names in emperor-facing pass text)
- [ ] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [ ] Real provider path used (stub-only evidence fails)
- [ ] Empty-world invention does not occur when projects exist
- [ ] Wrong-slug ask recovers with available inventory, not fiction
- [ ] Post-mutation second turn matches CLI
- [ ] Automated tests lock at least wrong-slug / list inventory behavior; LLM smoke recorded in Evidence

### In-scope P-gates

- Soft **U6**: provider budget exhaustion mid-inventory is a defect

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| _TBD — extend eval inventory tests + optional LLM smoke gate_ | Wrong-slug miss lists available projects; list inventory matches store |

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

See [LEARNINGS.md](LEARNINGS.md) (from suite 01). Run after 01–02; not required to start suite 02.
