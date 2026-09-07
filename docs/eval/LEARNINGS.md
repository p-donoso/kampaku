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
| **Catalog/bootstrap still mandate six-role software teams** | Novel/other domains get engineering recipes via skills/intent later | **Fixed in suite 18** — domain roster skill + no auto six-role on `create_missing_agents`; see [18-domain-agnostic-work.md](18-domain-agnostic-work.md). |
| Skill assignment map is software-only suffixes | Non-software specialists get no domain skills | **Fixed in 18** — fallback workflow skills for any emperor-named specialist suffix. |
| Emperor/product copy says "coding" as default stop-word | Biases non-software runs | Softened in **05**/**18** ("do not start execution"). |
| Injected `system-*` prompt fragments push software recipes even without tools | LLM biased before tool choice | **18** roster fragment domain-agnostic; no writing-recipe fork; keep LLM soft checks via **17**. |

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

## From 08 — Hands-off execution (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Kampaku had no chat go-ahead executor (and must not get general `execute_work_item`) | Suite needs hands-off run after plan without over-broad power | Fixed: narrow `execute_hello_eval_plan` |
| Public jobs surface was by-id only (list 404 / missing) | Cannot honestly claim visible progress | Fixed: `GET /api/v1/jobs?project=` + logs on job detail |
| Worker `run_check` is npm-shaped vs stranger node AC | Real execution would invent wrong checks | Sync executor runs `node hello.js` / `node --test` + writes `index.html` |
| Vague start-now must not start jobs | Soft note from **05**; regression locked in unit test | Keep pressure on **12** / **17** |
| LLM may ask “hit a wall?” after a clean success | Extra noise; oracle still met | Soft check **17** / HITL polish **10** |
| Host porcelain during WIP includes suite files | Isolation check must diff before/after the tool, not assume clean tree | Documented in suite 08 measure notes; deepen **15** |
| Hello Eval–named Kampaku tools are lab fixtures, not the long-term surface | More `*_hello_eval_*` tools would freeze demo names into the product | **BOARD E-010** end-of-arc: generalize tools+skills to product verbs; full re-test; no new fixture-named tools meanwhile |

## From 09 — Shared truth (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Kampaku had no wiki tools / stub; suite 08 never synced shared knowledge | Emperor cannot make published memory match disk | Fixed: product verb `publish_shared_knowledge` + read `get_wiki_tree` / `get_wiki_page` |
| Default `dev-setup` wiki invents `npm install` / `npm test` / `npm run build` | Fiction vs stranger node seed | Overwritten from disk on publish; keep pressure on default-pages honesty in **18** / bootstrap |
| Playwright specs inherited `KAMPAKU_CORE_URL=:8080` LLM core | E2e hit dirty/LLM instance instead of stub lab | Forced Playwright core URL in `playwright.config.ts`; ops note **16** |
| LLM may loop `get_wiki_tree` on “point me to pages” | Cost/noise; oracle still met | Soft check **17** |

## From 10 — Human in the loop (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| SMS/credentials prompt fell through to generic “route to lead” with no question | Emperor gate missing; work not blocked | Fixed: product verb `ask_blocking_question` + stub |
| `askDirect` alone did not pause a work item | Oracle needs linked work blocked | Extended `askDirect` with optional `workItemId` + block |
| Chat history sync recreated answered questions when context lacked conversation marker | Dashboard answer looked broken (card returned) | Fixed `syncChatQuestions` / duplicate checks by `question_id` |
| LLM may emit a second question id after the tool | Duplicate pending noise | Soft check **17**; prompt says emit `questionTag` verbatim |
| Emperor answer must resume blocked work without marking done | Gate without resume leaves the board stuck forever | Locked: `askDirect`+`workItemId` → `answer` resumes to `todo`; tests assert unblock ≠ done |
| Scenario fixtures leaked into product-verb tool defaults (SMS/Twilio in `ask_blocking_question`) | Generic tools must not bake suite demos | Cleaned: SMS only in stub/suite args; remaining Hello Eval fixtures stay on **BOARD E-010** end-of-arc checklist (tools+skills cleanup + full re-test) |

## From 11 — Honest done (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| After suite 08, board can stay `done` while disk is sabotaged | Job success ≠ honest done | Fixed: product verb `verify_and_close_work` re-runs disk checks; reopens on fail |
| Stub “do not mark done” plan prompts matched mark-done heuristic | Suite 07 stub regress | Excluded wait-for-go / do-not-mark phrasing from verify detector |
| LLM may bootstrap/re-plan on “mark it all done” instead of verifying the existing stranger | Leaves the real board silently green | Prompt: verify-only on close-phase; soft check **12** / **17** |
| LLM may invent check pass/fail that disagrees with tool output | Claim ≠ disk | Soft check **17**; prompt says report tool results verbatim |
| Multi-turn chat Send stays disabled | E2e flake on second UI turn | Sabotage close via API after first UI verify (**16**) |
| First `verify_and_close_work` draft baked Hello Eval / `hello.js` cues | Fixture leakage into a product verb | Fixed immediately: checks inferred only from AC / optional `checks` args |

### Pattern for E-010 revision (apply to remaining fixtures)

When greening a suite, do **not** treat the end-of-arc cleanup as license to ship fixture-shaped product tools. Prefer the `verify_and_close_work` resolution shape:

1. **Product verb** — durable name and contract (`verify_and_close_work`, not `verify_hello_eval_done`).
2. **Inputs drive behavior** — parse work-item AC / explicit args; never hardcode demo entrypoints, greetings, vendor names, or stack cues as tool defaults.
3. **Scenario copy stays outside** — suite stubs, emperor prompts, and optional call args only (same as cleaned `ask_blocking_question`).
4. **Refuse empty invention** — if nothing verifiable is stated, fail closed (do not invent a seed contract).
5. **At E-010** — apply the same shape to `execute_hello_eval_plan`, `propose_project_plan`, `publish_shared_knowledge`, and any leftover skill fragments; then full-arc re-test.

## From 12 — Scope and approval (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Stub had no path for platform rewrite + “start immediately” | Default chat ignored SaaS expansion | Fixed: product verb `request_scope_approval` (+ stub) parks on kampaku |
| `assess_change_request` alone does not park work | Oracle needs visible parked request | Tool assesses then parks blocked work + question |
| `ask_blocking_question` refuses platform project | Credential gate ≠ platform scope gate | Keep separate; soft check **17** if LLM mixes them |
| Docs-role overreach can look like “rewrite control plane” | Suite 04 regress | Scope detector excludes docs-role / delete-lead / `/tmp/evil` |

## From 13 — Survive interruption (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Sync Hello Eval executor is not interruptible | Kill mid-flight leaves dishonest or partial state | Suite 13 uses `start_durable_execution` (controlled_batch), not Hello Eval sync |
| Orphan `running` jobs after hard kill stayed green until 30m lease | Silent still-running lie | Fixed: `recoverJobsAfterRestart` on `serve` marks orphans `expired` |
| Cancel API existed but no Kampaku/CLI verb | Emperor/operator cancel incomplete on three surfaces | Added `cancel_execution` + `kampaku jobs cancel` |
| Scenario file counts must not be tool defaults | E-010 pattern | Counts/dirs live in stub/suite args only |

## From 14 — Least privilege (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Default FS allow-list included writable `$HOME` | SSH keys were in-bounds for `read_file` | Fixed: bootstrap workspace read-only only; no home |
| `list_files`/`read_file` unused by Kampaku | Prompt 2 path oracle weak | Wired Kampaku tools + sensitive-path deny |
| Worker writes had no secret content scan | API keys could land in stranger README via jobs | Fixed: worker `secret-hygiene` on write/replace |
| Docs-scoped secret+host edit had no stub | Chat could fall through | Stub refuse + override question (default No) |

## From 15 — Do not eat the host (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| No host-docs propose verb (park without write) | Session B fell through or invented success | Fixed: product verb `propose_repository_change` (platform parks `docs/` only; never apply) |
| Mix stranger + host in one unsupervised turn | Cross-contamination | Stub refuse before either write; tests lock both trees clean |
| Host porcelain already dirty during WIP | False isolation fails if you assume clean tree | Measure before/after; soft note already from **08** |
| Platform apply must stay closed | Accidental host rewrite | `apply=true` refused on kampaku; future apply path only after explicit yes (**16** UI answer surface) |
| E-010 | Generic verb, not Hello Eval–named | Followed; scenario copy only in stub/suite args |

## From 16 — Operator UI (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Wiki pending edits were view-only in UI | Journey 4 parity fail vs CLI approve/reject | Fixed: Approve/Reject buttons + API clients; lead-gated |
| Stranger bootstrap skipped default wiki pages | Propose/approve had no page to target | Fixed: `ensureDefaultWikiPages` on stranger bootstrap |
| Suite seed needed package-manager blocking ask | P3 path without SMS fixture | Stub routes to `ask_blocking_question` with scenario args |
| Long multi-journey e2e needs unique data/stranger dirs | Retries polluted shared paths | Lab note: unique `PLAYWRIGHT_*` dirs; conditional plan seed |
| Dedicated jobs list UI still soft | Soft note 08 | Defer list surface; Cancel remains on Job tab (**13**) |

## From 17 — Provider fidelity (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Stub inventory green ≠ LLM fidelity | Suite bar requires live provider for 10 | Locked: `eval-provider-fidelity.test.ts` + `KAMPAKU_EVAL_LLM_SMOKE=1` |
| Fresh conversation + “that project” asks for a slug | Prompt 3 needs post-mutation continuity | Smoke chains `conversationId`; doc notes honest clarify without continuity |
| Wrong-slug must surface tool miss + inventory | Invented projects break emperor trust | Stub + LLM smoke; `get_project` lists available slugs |
| Soft claim-vs-tool noise from 04–15 | Extra questions / prose drift under LLM | Soft prompts remain regression pressure; not re-run this greening |

## From 18 — Domain-agnostic work (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Baking a “writing agents” recipe repeats the software bias | Product fork of software vs novel | Pivoted: one agnostic path — emperor-named roles or one ask for an adequate set |
| `create_missing_agents` seeded six-role software roster | Domain projects got `*-frontend` | Fixed: create only plan-named lead/assignees |
| Catalog claimed mandatory six-role auto-create | LLM biased before tool choice | Softened `system-agent-roster` to domain-shaped / emperor-named teams |
| Empty AC defaulted to `npm test` | Fake engineering checks on any domain | Pad with engineering AC only when intent allows; else deliverable/check language |
| Arbitrary specialist suffixes had no skills | Only software suffixes were mapped | Fallback workflow skills for any non-lead specialist |
| “No frontend or backend” still matched roles | Negation parsed as role names | Infer roles skips negated engineering tokens |

## Cross-cutting (worthy of later analysis)

| Topic | Why | Disposition |
|-------|-----|-------------|
| Public jobs list / operator job surface returned 404 in a run | Hard to measure "no jobs started" on a public surface | Fold into **08** / **13** / **16** when measuring execution visibility. |
| Temporary roster permission path without Kampaku `assign_skill` | Emperor grant may be non-actionable | **04** / **12** authority honesty. |
| Stranger **non-code** deliverables (docs-only, research pack) | Suite **06** is OSS/repo-shaped | Keep **06** for repos; non-code stranger work owned by **18** (+ later **07**/**11** evidence kinds). |
| Honest done for non-software evidence | "npm test" is not universal | Soften **11** / **P1** examples; suite **18** when planning novel AC. |
| Human-readable plans for non-software | Cold reader should not need a repo mental model | Soft **P6** on **07** + **18**. |
| Cost / provider mid-turn exhaustion | Hides oracle failures | **U6** + suite **17** smoke; watch FreeLLMAPI budget mid-inventory. |
| English persistence vs emperor language in chat | Durable artifacts must stay honest | Suite **09** (and conversational exception already in protocol). |
| Dual Next.js / e2e lab friction | Slows honest U4 | **00** notes; **16** ops if productized. |
| One-shot integration arc (scientific calculator) | Isolated suite greens can hide mid-arc regressions | New suite **[19-one-shot-scientific-calculator.md](19-one-shot-scientific-calculator.md)** — run after 01–11 (prefer 15–16). |

## How to use this file

1. After greening a suite, append a dated section.
2. Update the target suite (or add a suite file) in the same PR when practical.
3. Open `BOARD.md` only for **blocking** product gaps; learnings here may be deferred non-blockers.
