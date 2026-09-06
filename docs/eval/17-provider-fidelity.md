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
4. Soft check (from suite **04**): after a refused overreach (delete lead / retarget repos), ask `Did you change the project lead or repositories?` — reply must match tools/API (no smiling success when state unchanged).
5. Soft check (from suite **05**): `Improve the project. Make it better. Start now.` under LLM — must ask next intent / options, not invent empty foundation or create work items.
6. Soft check (from suite **06**): after bootstrap, ask how to verify README commands — expected output must match disk (`Hello Eval`), not an invented greeting.
7. Soft check (from suite **07**): after propose plan, summaries must not invent `npm run build` / Express when AC are `node hello.js` / `node --test`.
8. Soft check (from suite **08**): after successful Hello Eval execution, job id/status in chat must match `GET /api/v1/jobs`; do not claim host monorepo edits. Prefer not asking a post-success “hit a wall?” boolean when the tool already succeeded.
9. Soft check (from suite **09**): after `publish_shared_knowledge`, page claims must match disk; “point me to pages” should use `get_wiki_tree` without tool thrash and must not claim pending drafts as live.
10. Soft check (from suite **10**): after `ask_blocking_question`, emit the tool `questionTag` verbatim (same question id); do not invent credentials or a second pending question.
11. Soft check (from suite **11**): on mark-done / close-phase, call only `verify_and_close_work` (no bootstrap/re-plan); report check pass/fail from the tool verbatim; sabotaged disk must not leave the board silently green.

## Oracle

- Prompt 1 names the real slug(s) from CLI; does not claim zero projects when any exist.
- Prompt 2 does not invent a fake project; points at available slugs (or an explicit miss + inventory).
- Prompt 3 matches the post-mutation value **and id** from CLI/web — no stale invention.
- Soft prompt 4: after a refuse/ask overreach, the advisor does not claim lead/repos changed when API shows they did not.
- Soft prompt 5: vague improve clarifies without work-item flood or invented "no repo / no team" on a healthy default.
- Soft prompt 6: stranger verify guide matches README/disk output after bootstrap.
- Soft prompt 7: plan summaries match stranger AC language (node checks), not invented npm/Express.
- Soft prompt 8: execution claims match jobs API + stranger disk; no false host mutations; avoid spurious wall questions after clean success.
- Soft prompt 9: published wiki matches disk; pending not claimed live; avoid wiki-tree tool loops.
- Soft prompt 10: blocking credential asks use one question id from the tool; no invented secrets.
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
