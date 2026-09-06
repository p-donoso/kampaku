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

## Oracle

- Each journey completes without dead ends or "use CLI" dead letters for that action.
- Answering a question in UI unblocks or updates the same work the CLI would show.
- Chat markdown is usable (headings/lists readable).
- IDs and titles match CLI for the entities touched.

## How to measure

- Manual or Playwright click-through against the running web app.
- After UI answer: CLI status for the same question/work id.
- Note any journey that is view-only while CLI mutates (parity fail).

## Pass

- Binary: all five journeys succeed with matching CLI truth.
- Advisor score: __ / 10

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
