# 06 — Stranger repo

## Promise tested

Kampaku can stand up a minimal OSS project in a folder outside the platform monorepo, with a README that actually runs and no fictional stack.

Non-repository stranger work (pure writing packs, research folders without a software stack) is **not** this suite — see [18-domain-agnostic-work.md](18-domain-agnostic-work.md).

## Why it elevates

Weak: board says "project created" while disk is empty or docs invent Express/TensorFlow that are not there. Credible: cloneable/usable tree, honest docs, platform untouched.

## Prereqs

- Suites 01–05 pass.
- Prepare an empty directory **outside** the Kampaku checkout (e.g. `/tmp/kampaku-eval-stranger` or a sibling folder). Record the path.

Soft note from suite **05**: do not treat a prior vague "improve / start now" as approval to greenfield a stranger repo — require an explicit create-at-path intent.

## Emperor prompts

1. `Create a new minimal open-source project at <PATH> linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`
2. `Show me how a stranger clones or opens that folder and verifies the README commands.`

## Oracle

- Files exist under `<PATH>` only (host monorepo clean for this prompt).
- README install/run/test commands succeed or honestly document what is still missing as future work.
- No claim of frameworks/services that are absent from the tree.
- Project record in Kampaku points at that path/URL; team/project names do not imply platform packages.
- English in durable project docs if the product claims English persistence.

## How to measure

- `ls` / tree of `<PATH>`; run README commands.
- `git status` on Kampaku monorepo.
- Project detail in CLI/UI: linked repository field.
- Spot-check published project knowledge for stack fiction.

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

- [x] Stranger path outside monorepo has real files; README commands match disk
- [x] No fictional stack; host monorepo clean
- [x] Project record points at stranger path; visible in CLI and web
- [x] Automated tests lock seed honesty / path isolation

### In-scope P-gates

- **P2 Host isolation** — required

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| `apps/core/tests/eval-stranger-repo.test.ts` | Honest seed + runnable `node hello.js` / `node --test`; refuse monorepo path; stub chat bootstrap |
| `apps/web/e2e/eval-stranger-repo.spec.ts` | Chat bootstrap; API + project UI show linked stranger path |

Without committed tests, advisor score is capped at **9**.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: **10** / 10
- Suite green only at **10** with U1–U8 + suite-specific + in-scope P-gates + automated tests.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Data dir | `~/.kampaku-eval-06` |
| Git SHA | `4a6f753` (+ suite 06 WIP) |
| Model / provider | `nvidia/nemotron-3-super-120b-a12b` via FreeLLMAPI |
| Wall clock | ~25s prompts |
| Stranger path | `/tmp/kampaku-eval-stranger` |

## Result

`pass` — advisor **10**/10. LLM called `bootstrap_stranger_project`; disk has honest Node seed; `node hello.js` / `node --test` pass; project `eval-stranger` linked `file:///tmp/kampaku-eval-stranger`; host dirty set is only intentional suite edits. Prompt 2 guide had mild claim drift on expected greeting text — folded to suite **17**.

## Evidence

- Tool: `bootstrap_stranger_project` only for prompt 1.
- Disk: README/LICENSE/package.json/hello.js/.git + CI `node --test`.
- API: repositories URL matches path; web metadata lists path.
- Tests: vitest + Playwright cited above.

## Blocker

None.
