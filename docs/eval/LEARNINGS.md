# Learnings from suite runs (deferred work)

Capture product elevation ideas found while greening a suite. Prefer **folding into an existing later suite** when the promise already fits. Add a **new suite** only when no later file owns the gap.

Language: product gaps and operator oracles — not skill/tool checklists.

## From 01 — Fresh start (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Real LLM can invent an empty world when inventory tools are weak or unused | Stub green ≠ emperor-grade inventory | Fixed in 01 (`list_projects` + prompt). **Deepen in [17-provider-fidelity.md](17-provider-fidelity.md)**. |
| Workspace `.env` can overwrite CI/e2e `KAMPAKU_AGENT=stub` | Automated U4 flakes or silently runs LLM | Protocol note in [00-protocol.md](00-protocol.md); product: `KAMPAKU_DOTENV_OVERRIDE=0`. |
| Next.js 16 locks one `apps/web` dir — Playwright cannot start while `kampaku dev` web is up | Blocks honest U4 without tribal knowledge | Protocol in 00; **ops journey in [16-operator-ui.md](16-operator-ui.md)** (document or dual-dev). |
| "What must I decide?" after a healthy default invents missing vision/CI/repo work | Fake first-run blockers when the instance is already ready | Fold into [05-intent-to-work.md](05-intent-to-work.md) oracle. |
| Three-surface truth needs **UI content** + e2e, not HTTP 200 | Already U3; easy to skip under time pressure | Keep pressure on 02/16; 01 cites Playwright. |
| `serve` must seed defaults without a separate bootstrap | Empty instance stranger path | Fixed in 01. |

## From 02 — Three surfaces (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Advisor cannot set a visible project note | Chat dead-ended vs CLI/web | Fixed in 02 (name/description). Deny governance in **04** / **12**. |
| Detail panel Save used stale handlers | UI looked saved; API unchanged | Fixed header actions; generalize multi-entity save in **16**. |
| `get_project` without `id` | Weak id confirmation | Fixed; deepen in **17**. |
| Incremental regression across green suites | Later fixes can break earlier 10s | Protocol rule in **00**; always re-run `01…N` tests. |

## From 03 — Standing team (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Staffing via `submit_intent` creates work items | Breaks staff-only / no-exec oracle | Fixed: `staff_project_team`. Keep **05** clear that intent ≠ staff-only. |
| Free-form roster on Kampaku | Over-broad power | Staffing gated; free-form create denied (**04**). |
| Conflicting project lead overwrite | Duplicate accountability | Tool refuses; soft-check **04**/**12**. |
| Vague novel staffing invented software roles | Domain lie | Fixed in 03 staffing path (roles required + ask-first). |
| **Catalog/bootstrap still mandate six-role software teams** | Novel/other domains get engineering recipes via skills/intent later | **New suite [18-domain-agnostic-work.md](18-domain-agnostic-work.md)** — recipes, skill maps, plan AC language. |
| Skill assignment map is software-only suffixes | Non-software specialists get no domain skills | Suite **18** (+ skill catalog elevation). |
| Emperor/product copy says "coding" as default stop-word | Biases non-software runs | Soften suite prompts / product replies in **05**/**18** ("do not start execution / writing"). |
| Injected `system-*` prompt fragments push software recipes even without tools | LLM biased before tool choice | Suite **18** must prove runtime/recipe behavior, not only staffing tool. |

## From 04 — Capability boundary (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Allowlist alone ≠ clear refuse/ask UX | Stub/LLM can route vaguely while state stays safe | Fixed stub refuse + ask; claim-vs-tool honesty soft-check in **17**. |
| `delete_sub_agent` / `update_sub_agent` lacked runtime skill+hierarchy gates | Docs-scoped actor could delete if tool reached | Fixed gates; full host isolation remains **14**/**15**. |
| Shared Playwright data dir accumulates pending questions across suites | Suite 01 e2e strict-mode flakes when run after 04 | Hardened 01 locator; ops note stays in **00**/**16**. |
| LLM may ask clarifying project slug instead of hard refuse on prompt 3 | Still no mutation — acceptable escalate path | Soft note on **12**; deepen if claim drift appears. |
| HTTP agent DELETE remains ungated | Out of chat oracle; real hole for operators | Journey folded into **16**; residual authority honesty on **12**. |

## From 05 — Intent to work (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Vague improve had no structured clarify (prose-only stub) | Emperor gets no machine-readable decision; board flood risk on LLM | Fixed stub + prompt `intent-next-focus`; deepen provider path in **17**. |
| Healthy-default "what must I decide?" invented repo/six-role foundation | Fake first-run blockers on ready instances | Fixed next-intent ask; keep pressure on **01**/**10** question honesty. |
| HTTP `POST /api/v1/intents` without mode can still persist plans | Chat clarify ≠ API flood bypass | Soft note **12** / **16**; do not treat CLI/API omit-mode as emperor confirm. |
| "Start now" urgency ≠ confirmed scope | Jobs could start from vague language later | Soft note **08**; execution only after approved plan (**07**/**08**). |
| Improve options may still sound software-shaped (CI/UI) | Domain capture on platform project is OK; novel must not inherit | Soft contrast already in **18**; greenfield only after confirm in **06**. |

## From 06 — Stranger repo (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Kampaku could staff DB projects but not seed external disk | Suite oracle needs real OSS tree + link | Fixed: `bootstrap_stranger_project` + honest seed |
| Old auto-seed invented npm/Express-shaped README without package.json | Fiction fails stranger credibility | Fixed honest Node `hello.js` / `node --test` seed; skill prompt updated |
| Project UI showed only repository **count** | U3 weak for linked path | Show path strings in project metadata (**16** deepen edit flows) |
| LLM verify guide drifted from README expected output | Claim ≠ disk | Soft check in **17** |
| Non-repo stranger work must not widen this suite | Writing/research packs | Remains **18** |

## From 07 — Plan a human can run (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Kampaku had no board-visible plan path (no submit_intent; preview invisible) | Suite needs multi-step todos with ids outside chat | Fixed: `propose_project_plan` persists Hello Eval todos without jobs |
| Default AC patterns favored `npm test` over stranger seed | Fiction vs suite 06 honesty | Extended `VERIFIABLE_AC_PATTERN` for `node --test` / `node hello.js` |
| LLM may say “npm-style checks” while AC are node commands | Claim drift | Soft check **17** |
| Chat Send stays disabled until prior turn settles | Multi-prompt e2e flakes | e2e bootstraps via API then single chat plan turn; ops note **16** |
| Execution must still wait for emperor go | Planning ≠ running | Soft note already on **08**; deepen in **11** |

## Cross-cutting (worthy of later analysis)

| Topic | Why | Disposition |
|-------|-----|-------------|
| Public jobs list / operator job surface returned 404 in a run | Hard to measure "no jobs started" on a public surface | Fold into **08** / **13** / **16** when measuring execution visibility. |
| Temporary roster permission path without Kampaku `assign_skill` | Emperor grant may be non-actionable | **04** / **12** authority honesty. |
| Stranger **non-code** deliverables (docs-only, research pack) | Suite **06** is OSS/repo-shaped | Keep **06** for repos; non-code stranger work owned by **18** (+ later **07**/**11** evidence kinds). |
| Honest done for non-software evidence | "npm test" is not universal | Soften **11** / **P1** examples; suite **18** when planning novel AC. |
| Human-readable plans for non-software | Cold reader should not need a repo mental model | Soft **P6** on **07** + **18**. |
| Cost / provider mid-turn exhaustion | Hides oracle failures | Already **U6**; deepen in **17**. |
| English persistence vs emperor language in chat | Durable artifacts must stay honest | Suite **09** (and conversational exception already in protocol). |
| Dual Next.js / e2e lab friction | Slows honest U4 | **00** notes; **16** ops if productized. |

## How to use this file

1. After greening a suite, append a dated section.
2. Update the target suite (or add a suite file) in the same PR when practical.
3. Open `BOARD.md` only for **blocking** product gaps; learnings here may be deferred non-blockers.
