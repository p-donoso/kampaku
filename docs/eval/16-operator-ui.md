# 16 — Operator UI

## Promise tested

Critical operator journeys work by clicking: chat, pending questions, work board, and project knowledge — not screenshots of static pages.

## Why it elevates

Weak: UI is a brochure over CLI. Credible: an emperor can supervise without the terminal for the same truths suites 02/10 require.

## Prereqs

- Suites 01–02 pass at minimum; preferably 10 has produced a pending question once. If not, force a question: `I will not give you the deployment target; ask me before planning deploy.`

## Emperor prompts (seed state)

1. `Ask me one blocking question about preferred package manager for the stranger project, then wait.`
2. Leave the answer for the UI path (answer in the web UI, not only in chat CLI).

## Click-through journeys (required)

Perform each; screenshots alone do not pass:

1. Open chat; send a short message; see the reply render as readable markdown.
2. Open pending questions (or equivalent); answer the package-manager question; confirm chat/board reflects the answer.
3. Open the work board / project work list; open one item detail.
4. Open project knowledge / wiki (or documented equivalent); view a page; if proposals exist, approve or reject one as lead/emperor.
5. Open agents or team view; confirm hierarchy readable.
6. **Edit+save persistence (from suite 02):** In the project detail panel, edit description (or name), save, and confirm API/CLI shows the new value. Repeat edit+save on **one other** entity type that uses the same detail-panel chrome (agent, skill, or work item). A UI that returns to view mode without persisting is a fail.
7. **Ops note (from suite 01 lab):** If this suite's Playwright webServer cannot start because another `next dev` holds `apps/web`, that is an operator/product friction — record on BOARD; prefer documenting stop-stack-before-e2e or a dual-dev fix.
8. Soft note from suite **08**: jobs list (`GET /api/v1/jobs?project=`) exists — prefer a UI jobs/progress surface that uses it, not chat-only job ids.
9. Soft note from suite **09**: Playwright must not inherit workspace `KAMPAKU_CORE_URL` pointing at a personal LLM core — config forces the lab core port; keep dual-dev / stop-stack notes honest.
10. Soft note from suite **10**: after answering a pending credential question, history sync must not recreate it — regression locked via `question_id` matching in `syncChatQuestions`.
11. Soft note from suite **11**: after an honest-done chat turn, Send stays disabled until the turn settles — prefer API for a second sabotage close in e2e, or wait for enabled Send.
12. Soft note from suite **12**: after parking a platform scope expansion, pending `scope-expansion-approval` must be answerable on the dashboard the same way as other emperor gates.
13. Soft note from suite **13**: job Cancel control (web/API/CLI) must stop interruptible durable batches; expired/lost after restart must not render as healthy running.
14. Soft note from suite **14**: allowed-folder UI/settings must not advertise writable `$HOME`; sensitive path denials should be visible in chat.
15. Soft note from suite **15**: after parking a host `docs/` repository-change proposal, pending `repository-change-approval` must be answerable on the dashboard; answering No leaves host bytes unchanged.
15. **Auth surface (from suite 04):** From web or documented HTTP, attempt to delete a project lead agent (or equivalent destructive roster action) without emperor override. Expect deny, confirm dialog that does not complete silently, or no such control — not an ungated DELETE that removes the lead while chat refuses the same ask.
14. **Clarify visibility (from suite 05):** After a vague improve prompt, pending next-intent options appear in chat and pending-questions; answering "Defer" leaves the work board unchanged.
15. **Linked stranger path (from suite 06):** Open the stranger project detail; repository path(s) are visible (not only a count).
16. **Plan board (from suite 07):** After Hello Eval plan prompt, project work list shows multiple todo steps with stable titles/ids; Send is usable for the follow-up turn.

## Oracle

- Each journey completes without dead ends or "use CLI" dead letters for that action.
- Answering a question in UI unblocks or updates the same work the CLI would show.
- Chat markdown is usable (headings/lists readable).
- IDs and titles match CLI for the entities touched.
- Detail-panel saves persist for project and the second entity type (no stale-handler class of bug).

## How to measure

- Manual or Playwright click-through against the running web app.
- After UI answer: CLI status for the same question/work id.
- Note any journey that is view-only while CLI mutates (parity fail).

## Advisor 10/10 checklist

Universal gates (see [README.md](README.md)): **U1** empty instance · **U2** public docs · **U3** three-surface truth · **U4** automated tests · **U5** fresh re-run · **U6** cost honesty · **U7** no catalog capture · **U8** BOARD clean for this suite.

Mark each during the run:

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Chat + CLI + web agree on ids/fields (when state is touched)
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent tool-budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite

### Suite-specific (must all be yes for 10)

- [ ] All six click-through journeys succeed (chat, pending Q answer, board, knowledge, team, edit+save ×2 entity types)
- [ ] UI answer updates same ids CLI shows
- [ ] Automated tests: Playwright/e2e covering at least chat + pending question + board + one persisting detail-panel save

### In-scope P-gates

- **P3 Human gate in UI** — required

## Automated tests (required for advisor 10)

| Test | Locks |
|------|--------|
| _TBD — add before claiming 10_ | Suite promise regression |

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
| Web base URL | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker
