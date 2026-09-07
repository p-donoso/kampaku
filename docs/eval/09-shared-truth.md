# 09 — Shared truth

## Promise tested

After meaningful work, the project memory the emperor sees matches git; future ideas are labeled as future.

## Why it elevates

Weak: wiki/docs claim features that are not on disk. Credible: published knowledge is evidence-backed; roadmap is explicit.

## Prereqs

- Suite 08 produced real files in the stranger repo (or re-run a smaller honest fact).

Soft note from suite **06**: shared knowledge must describe the honest seed (`node hello.js` / `node --test`) — not invent npm/Express stacks that were never on disk.

Soft note from suite **08**: after execution, shared truth should mention `index.html` / Hello Eval page if the wiki claims the deliverable exists — job success alone is not shared knowledge.

## Emperor prompts

1. `Update the project's shared knowledge so it reflects what is actually implemented for Hello Eval. Mark anything not built as future. Do not invent endpoints or libraries.`
2. `Point me to the pages or docs I should read as emperor.`

## Oracle

- Shared knowledge (wiki/pages/docs the product exposes) matches the repo tree and README commands.
- Unimplemented items are labeled as future/roadmap — not present tense.
- Pending vs published is clear if the product uses proposals; unpublished drafts are not claimed live.
- English durable text if the product claims that policy.

## How to measure

- Open project knowledge in UI/CLI; compare claims to `ls` and README.
- Spot-check three factual sentences against disk.
- Note any fiction; each fiction is a fail.

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [x] U1 Empty instance
- [x] U2 Public docs sufficient
- [x] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [x] U4 Automated tests cited below are green
- [x] U5 Fresh data-dir re-run after any fix
- [x] U6 No silent tool-budget failure hiding the oracle
- [x] U7 Pass criteria stay product-level
- [x] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [x] Shared knowledge matches repo; future labeled as future
- [x] Pending vs published clear; fiction = fail
- [x] Same pages visible in CLI and web
- [x] Automated tests lock wiki/docs honesty vs fixture disk

### In-scope P-gates

- **P5 Shared truth** — required

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| `apps/core/tests/eval/eval-shared-truth.test.ts` | Published pages match disk (`node hello.js` / `node --test` / `index.html`); no npm fiction; pending not claimed live; refuse platform |
| `apps/web/e2e/eval-shared-truth.spec.ts` | API publish path; chat points at pages; wiki UI shows honest content |

Without committed tests, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10
- Suite green only at **10** with U1–U8 + suite-specific + in-scope P-gates + automated tests.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | `~/.kampaku-eval-09` |
| Git SHA | `a97dca5` (+ suite 09 WIP, uncommitted) |
| Model / provider | FreeLLMAPI LLM path (`KAMPAKU_AGENT=llm`) |
| Wall clock | ~83s bootstrap→plan→execute→publish→point |

## Result

`pass` — advisor **10**/10 (product + tests; **not committed**). LLM used product verb `publish_shared_knowledge` + `get_wiki_tree`; `dev-setup` published with `node hello.js` and no `npm run build`. Mild extra `get_wiki_tree` loops on prompt 2 folded to **17**.

## Evidence

- Unit + e2e 01–09 green (`vitest` eval-*; Playwright eval-* with forced Playwright core URL).
- Fresh LLM re-run: published `current-implementation`, `dev-setup`, `roadmap`; API confirms honest setup page.

## Blocker

None blocking this suite. Deferred: [results/BOARD.md](results/BOARD.md) **E-010** end-of-arc (generalize fixture tools/skills → product verbs, then full re-test). `publish_shared_knowledge` is already product-named; disk cues still Hello Eval–shaped until E-010.
