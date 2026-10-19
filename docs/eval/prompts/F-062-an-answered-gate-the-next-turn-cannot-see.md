# Kickoff — F-062, an answered gate the next turn cannot see

Kampaku eval lab. A **blocking** product defect, reproduced on suite 03's run `s03r3` (fresh data dir, git
`618e4c9`, five driven turns across two projects). You do the work; I do not.

Read the measurements first:

- `.kampaku/runs/s03r3/logs/p0-infra.out` — the staffing turn for `s3-infra`; it closes on a
  `<kampaku-question id="s3-infra-docs-station">` with the two options.
- `.kampaku/runs/s03r3/logs/s03-drive.log` — the turn order, each with its conversation id and tool list.
- `.kampaku/runs/s03r3/logs/p1-infra.out` — the **next turn in the same conversation**, which asks the same
  decision again ("Documentation is the one uncovered aspect with real work behind it… how should it be owned?")
  while a durable state block was in its prompt.
- `.kampaku/runs/s03r3/logs/p0-webapp.out` and `p1-webapp.out` — the same shape on the second project: the gate
  answered with *"Real S3-backed UI — data comes from an external service this app consumes"*, and the next turn
  asking *"Does this app consume an external service for /items, or should it serve its own route handlers?"*.
- `docs/eval/results/BOARD.md` — **[F-062]** (this row), and **[F-049]** / **[F-050]** (resolved: one decision
  one gate, and the front office can see its own **pending** gates). This row is the third corner: an
  **answered** gate.

## The defect, in one line

A gate is raised in chat, answered through the documented surface, and the answer reaches no conversation — so
the next turn re-asks the decision it just had answered, and the operator's answer buys nothing.

Measured twice in one run, on both projects, with `GET /api/v1/questions/08a33493-…` answering `answered` and the
answered value (`Keep the five stations — document within existing stations`, `Real S3-backed UI …`) sitting in
the store while neither follow-up turn mentioned it.

## Where the answer goes missing

- `apps/core/src/agents/runtime/durable-state.ts` — `snapshotForPrompt` carries `openGates` from
  `questionStore.list("pending")` and nothing else. An answered gate is invisible to the block.
- `apps/core/src/agents/runtime/session.ts` — `buildHistoryContext` replays the conversation's messages. The
  answer is stored on the question, not appended to the conversation, so the history has the *question* in the
  assistant reply and no answer anywhere.
- The CLI already says the truth out loud (`apps/core/src/cli/questions-output.ts` — `describeAnswerOutcome`
  states that nothing was resumed), which is the honest reading of the gap and not a fix for it.

## Done means

- **An answer is visible to the conversation that asked.** Whatever the mechanism — the block renderings the
  most recent answered gates with their decision, the answer appended to the conversation, or the turn being
  told the gate is already answered — the next turn can tell that this question was answered and with what, and
  stops re-asking it. Bounded: the last few per project, not the whole history.
- **The turn is told what to do with it**: a decision already taken is a constraint, not a topic to reopen. If
  the later turn believes the answer is now stale, it says so and asks for **that** change, rather than
  re-asking the original question unchanged.
- **A lock asserts it**, in `apps/core/tests/` — a question raised, answered, and a subsequent turn whose prompt
  carries the answered decision and does not re-ask it. Verified **red without the fix**.
- **Patched with what was measured**: the BOARD row gets the fix, the lock and the re-measurement,
  `docs/eval/03-stations-and-staffing.md` the sentences it changes, one reviewable commit on `develop`,
  conventional commit with a scope. Leave alone what you did not touch; the tree may carry other sessions'
  prompts under `docs/eval/prompts/`.

## Out of scope (each is its own row)

- **[F-111]** — a chat-rendered question whose `id` was already used is swallowed by id-based idempotence, so a
  *different* decision is never stored. Own chat; it lives in `question-store.ts`'s `askEmperor` and touches the
  same file you will read, so do not fix it here.
- **[F-022]** — skill authoring. Own chat.
- **[F-006]** — proposed roster versus created roster. Own chat.
- Making the answer resume **work** (parked items, F-007) — this row is about the conversation's own context.
