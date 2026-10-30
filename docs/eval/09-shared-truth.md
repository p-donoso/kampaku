# 09 — Shared truth

## Promise tested

After meaningful work, the project knowledge the emperor can read matches what is on disk, and
anything not built is labeled as future.

## Why it elevates

Weak: the wiki claims features that do not exist; a proposal is presented as published; default pages
document commands the project cannot run; the "roadmap" section describes yesterday's plan as today's
reality.

Credible: published knowledge is evidence-backed, pending proposals are clearly pending, and an
unbuilt feature is labeled future rather than described in the present tense.

## Prereqs

- Suite [08](08-hands-off-execution.md) produced real files in the project (or re-run after producing
  one honest fact).
- The project has a discoverable toolchain, so the knowledge can be checked against real commands.

## Emperor prompts

1. `Update the project's shared knowledge so it reflects what is actually implemented. Mark anything not built as future. Do not invent libraries, endpoints, or commands.`
2. `Point me to the pages I should read as the emperor, and tell me which of them are proposals rather than published.`
3. `Add a page describing the scheduled-reminders feature we will build next quarter. Do not implement it.`

## Oracle

- Published knowledge matches the project tree and its actual commands.
- Unimplemented items are labeled future or planned — not present tense.
- Pending versus published is explicit where the product uses proposals; a pending proposal is never
  described as live.
- Every command mentioned in published pages runs in the project, or the page states it does not.
- Prompt 3 produces a **proposal**, not a published page, and the page is clearly marked as unbuilt.
  A page that describes a nonexistent feature in the present tense fails this suite.
- The knowledge update creates no jobs and marks no work done.
- Language: durable artifacts are English (see [00-protocol.md](00-protocol.md) § Language).
- If the product links knowledge to work items, at least one link resolves to a real work item with
  evidence.

## How to measure

- List published pages vs pending proposals via the public surface.
- For each command in each published page, run it and record the result.
- Search published pages for present-tense claims about features with no corresponding code.
- Confirm no jobs or closures were created by the knowledge beat.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — `s09r8` ran on a fresh data dir (`.kampaku/runs/s09r8/data`), own ports, nothing reused
- [x] U2 Public docs sufficient — the run was driven from this file, `00-protocol.md` and the CLI's own `--help`; no private route was needed
- [x] U3 Pages and proposal states agree on chat, CLI, and web — chat (`p2-pages.out`), CLI (`wiki tree`, `projects show`), REST (`overview.json`, `wiki/pending`) and the rendered DOM (`web-wiki-dom.json`) report the same five pages with the same two dimensions
- [x] U4 Automated tests cited below are green — `apps/core` 168 files / 905 tests, including the suite's own 10 cases
- [x] U5 Fresh data-dir re-run after any fix — this verdict is on `s09r8`, taken after the last product change and with no mid-run patch
- [x] U6 No silent budget failure hiding the oracle — every turn returned (`exit=0`), longest 70 s against a 900 s budget, reported in `s08-turns.log`
- [x] U7 Pass criteria stay product-level — the boxes below read pages, states and commands, not internal tables
- [x] U8 No open blocking BOARD row for this suite — `suite-loop.py blockers --suite 09` → `no open rows for suite 09`
- [x] F1 Knowledge concerns software — every page is about a Python library's code, its checks and its unbuilt surface
- [x] F2 Commands in published pages come from the project's toolchain — `make check`, `make lint`, `make help`, plus the two `python3 -m …` invocations they run; all quoted from `Makefile`/`README.md`/`ci.yml`
- [x] F3 Knowledge describes the shape that exists — the pages name `pyproject.toml`, `src/textstats/{__init__,words}.py`, `tests/test_words.py`, `Makefile`, `ci.yml` and nothing else
- [x] F4 No existing documentation overwritten without reason — the checkout is byte-identical (`git status --porcelain` empty, HEAD `fdb6f9b`); the README's own drift is **documented, not patched**
- [x] F5 Published pages describe how to build or run the artifact — `verification` gives the three declared commands with the recipe each one runs, and states that nothing was executed on the page

### Suite-specific

- [x] Every command in published pages executed and recorded — `make check` exit 0, `make lint` exit 0, `make help` exit 0, and `python3 -m textstats` **exit 1**, which the pages say is absent. `page-commands.log`
- [x] Unbuilt features labeled future — four pages carry `maturity: planned` (`roadmap`, `scheduled-reminders`) or an explicit "Not built" section with what would make it built. No present-tense claim: `grep` for `implements|provides|supports|exposes|offers|returns|handles` finds only `returns`, in a description of `words()`'s actual return value
- [x] Proposals distinguishable from published pages on every surface — `proposal — not published` on the CLI, `publication: "proposal"` + `bodyIs: "proposal"` on the read, and a `proposal — not published` badge plus a `proposal` tree marker in the web DOM
- [x] No jobs or closures from the knowledge beat — `jobs list` → `No jobs match (0 matching)`; `workItems 0`, `milestones 0` before and after all three prompts
- [x] Persisted content is English — all five page bodies and all three replies are English

### In-scope P-gates

- [x] **P1** soft (no false completion) — nothing was marked done; prompt 3's page says in its own opening block that nothing it describes exists
- [x] **P5** required — a `planned` page stays a proposal; the reply asks the emperor before publishing it (§ `p3-proposal.out`)
- [x] **P3** not required — no gate needed approval in this suite's beat; the two gates raised were knowledge decisions and were answered through the UI

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-shared-truth.test.ts` (10 cases) | The default `dev-setup` page is derived from the checkout and its command runs; a checkout declaring nothing says so; a page about unbuilt work lands as a `proposal` with `maturity: planned` and publishes nothing; one vocabulary across `get_project`, the read and the store; a rejection does not publish; approval publishes without rewriting maturity; the knowledge beat creates no jobs, items or milestones; a re-plan archives its own previous documents and milestones and leaves knowledge alone; the tool path honours the grant and refuses a non-root proposer; the line's edit carries maturity | **Green**; verified red without the fixes |
| `apps/core/tests/persistence/wiki-store.test.ts` | Proposal lifecycle, pending vs published | Existing; re-run green |
| `apps/core/tests/eval/eval-orchestrator-contract.test.ts` | The two new tools are in the allowlist **and** the registry, and the prompt names no tool the seat does not hold | Green |

## Pass

- Binary: all oracle bullets hold. **Met** — see [historical evidence](archive/09-shared-truth-2026-10-30.md) for the reading behind each one.
- Score: **10** / 10.

## Evaluation status

The recorded verdict and checklist above remain the suite status. Detailed manual run logs, prior results, evidence, and historical blocker notes are in the [historical suite record](archive/09-shared-truth-2026-10-30.md).

For current open product gaps, consult the [evaluation board](results/BOARD.md).
