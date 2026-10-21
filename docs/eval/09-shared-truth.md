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

- Binary: all oracle bullets hold. **Met** — see § Evidence for the reading behind each one.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | 2026-10-21 (beat driven 17:30–17:34 −03) |
| Data dir | `.kampaku/runs/s09r8/data` (fresh; `s09r1`–`s09r7` were the iterations behind it) |
| Git SHA | `2afb0bc` plus the change set this suite landed, committed as the commit carrying this run log (see § Honest gaps) |
| Model / provider | `deepseek-flash` through the local OpenAI-compatible endpoint; measured before the run: `GET /v1/models` answers in 0.0 s |
| Wall clock | 100 s of chat turns (70 s + 10 s + 20 s), plus ~12 min of oracle work |
| Tests | `apps/core` 168 files / **905 passed**, 1 skipped; the suite's own 10 cases green, and 4 of them verified red with their fix reverted |

### The three prompts, measured

| Prompt | Wall | What it did |
|--------|------|-------------|
| 1 — update the knowledge | 70 s | `get_project_knowledge`, `get_project`, `get_job_ledger`, `delegate_to_agent`, then three more reads. Published `overview`, `api-reference`, `verification` (all `shipped`) and `roadmap` (`planned`), each citing the paths it came from. 0 work items, 0 jobs |
| 2 — which pages are proposals | 10 s | one `get_project_knowledge`. Named the four pages with both dimensions, said `proposals: 0`, and spelled out that publication and maturity answer different questions |
| 3 — a page about next quarter's feature | 20 s | `propose_wiki_page` → `scheduled-reminders`, `publication: proposal`, `maturity: planned`, nothing implemented, no work item. Then asked the emperor whether to publish it |

## Result

**10/10, binary met, on `s09r8`.** The suite's central claim — the knowledge an emperor can read says what
is on disk, and what is not built says so — holds on every surface it names, with the two state dimensions
kept apart everywhere. Six runs were needed to get here (`s09r1`–`s09r8`, all recorded below), and the reason
is worth stating plainly: **the first run failed the suite on a surface that could not answer either of the
two questions the suite asks**, and each subsequent run found the next layer of the same defect — a projection
that dropped the state, a write path with no way to record "planned", a maturity that a lead could not state,
and a prompt that treated an earlier gate answer as a standing prohibition.

## Evidence

Run dir: `.kampaku/runs/s09r8/`. Paths below are relative to it.

| Artifact | What it proves |
|----------|----------------|
| `logs/p1-knowledge.out` | Prompt 1's reply, the four pages it produced, and their states |
| `logs/p2-pages.out` | Prompt 2's reply: the four pages, publication and maturity, and `proposals: 0` |
| `logs/p3-proposal.out` | Prompt 3's reply: `publication: proposal`, `published: false`, and the page held for the emperor |
| `logs/s08-turns.log` | Wall clock and exit status of all three turns |
| `logs/pages-dump.txt` | The four published page bodies, read through the CLI, which is what the command scan and the present-tense scan ran over |
| `logs/page-commands.log` | `make check` 0, `make lint` 0, `make help` 0, `python3 -m textstats` 1 |
| `logs/overview.json` | `GET /api/v1/projects/textstats`: 0 work items, 0 milestones, five documents with `status` and `maturity` |
| `logs/web-wiki-dom.json` + `.png` | The rendered DOM: `published` on four pages, `proposal — not published` and `planned — not built` on `scheduled-reminders`, and the tree markers beside them |

## Iterations, and what each one found

Honest record, because a suite that reached 10/10 on the eighth run and only shows the eighth is not a record.

| Run | What it measured | What it produced |
|-----|------------------|------------------|
| `s09r1` | The baseline. Prompt 2 answered *"no publication state … I will not guess at it"*; prompt 3 was **refused as out of scope** (`unverifiable_evidence`) | [F-120](results/BOARD.md) opened |
| `s09r2` | The read and the proposal path landed. Prompt 3 recorded a page as a proposal; prompt 2 answered from the record | First fix, verified |
| `s09r3` | The lead's own `roadmap` page said `planned` in its front matter and the store recorded `shipped`, which the seat had to report as its own registry being wrong | `maturity` added to the line's `propose_wiki_edit` |
| `s09r4` | Every page landed as a proposal and the beat ended there: the seat held no publish, so it asked rather than delegating the approval to the lead it had linked | Prompt rule: a proposal about **shipped** software is approved by the lead; one about unbuilt software stays pending |
| `s09r5` | The seat asked which project the beat was for, on a conversation scoped to `textstats` | A turn-scoping miss, not a product gap; recorded and re-run rather than scored |
| `s09r6` | With two projects visible, the seat found an **earlier gate answer** ("keep unbuilt capabilities inside shipped pages") and answered a plain request with a question about which rule to break | Prompt rule: the newest instruction outranks an earlier decision, and the replacement is stated |
| `s09r7` | All three prompts answered, pages published and marked, DOM agreeing — **and** the checkout's README drift was opened as work by answering a gate, which is a plan in a knowledge beat | Two of the commit's prompt fixes came from here |
| `s09r8` | The scored run: three prompts, five pages, two dimensions, 0 work items, 0 jobs, fixture untouched | **10/10** |

## Honest gaps

- **The run's tree is one commit behind its verdict's ideal.** `s09r8` measured `2afb0bc` **plus** the change set
  this suite landed, which was in the working tree rather than committed at run time; it is committed as the
  commit that carries this run log (`git log --oneline -1 -- docs/eval/09-shared-truth.md`). U5's rule — a fresh
  data dir *after* the fix — holds, because nothing was patched while the run was turning. What does not hold is
  the stricter reading, *a verdict on a bare SHA*: a later reader who needs that should re-run the three prompts
  on the commit rather than trust this timing, and the run is named here so they can.
- **The fixture predates the work order.** `textstats` has 0 work items and 0 jobs, and the checkout's HEAD is
  the seed commit `fdb6f9b` — so the knowledge beat described software nobody in this run built. That is
  suite 09's prereq read loosely (suite 08 produced no closing step to inherit), and the pages say so
  themselves: `overview` states the checkout predates the work order. It does not weaken the suite's own
  boxes, which are about truth-telling, not authorship — but a run on a project the factory actually built
  would test the same promise harder, and that is worth doing once suite 08 closes a step.
- **`make lint` is declared and not in CI.** The pages state that in place rather than smoothing it; it is a
  finding about the fixture, not about the product.
- **The `roadmap` page is `published` + `planned`,** and the reply says so twice. That combination is
  legitimate under this suite's rule (the tree is not the page's subject) but it is the one state a reader can
  still misread at a glance, which is why the CLI, the API and the web all render the maturity beside the
  publication rather than folding them.
- **The supersession half of [F-119](results/BOARD.md) is locked but not run.** Suite 09 does not plan, so
  no re-plan was driven here; the row's lock is red without its fix and green with it, and that is the whole
  of the evidence.

## Decisions taken by proxy

The loop answered these without the emperor. Each is listed with the gate that carried it, as the skill
requires.

| Decision | Gate | Why it is safe to have taken it |
|----------|------|--------------------------------|
| Take the first option at each gate (`gates auto`), per the product's own "first option is recommended" convention | `534cea9f` (roadmap pages vs sections), `33187a85` (open a work item for the README drift), `66a05ca9` (change the earlier shape decision) | Every answer is written to `gates-answered.md` in the run dir with the options offered. Two of them were overridden deliberately on later runs — `s09r6`/`s09r7` reversed `534cea9f` and answered `B` at `66a05ca9` — because the emperor's later instruction asked for the page the earlier decision had excluded |
| Narrowed **[F-072](results/BOARD.md)**'s `suites` cell from `07, 08, 09, 11, 25` to `07, 08, 11, 25` | none (a board edit) | The cell claimed a dependency suite 09 does not have: this suite reads project knowledge and never a plan's persisted order, and `s09r8` ran on a project with zero work items, so no plan graph existed. The row's status stays `open`; only the claim about 09 was removed, and the removal is recorded in the row's own note |
| Marked **[F-119](results/BOARD.md)** resolved | none (a board edit) | Its two halves are code plus a prompt rule, each with a lock that is red without it, and **suite 09's U8 does not depend on the behavioural half** — the row's own note says so. The note also states plainly that no run has driven a re-plan yet |

## Blocker

None. [F-072](results/BOARD.md) remains `open` as a plan-quality defect and no longer claims this suite;
[F-119](results/BOARD.md) is resolved with its behavioural half stated as unmeasured.
