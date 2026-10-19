# Kickoff — F-111, a question reused under an old id is never stored

Kampaku eval lab. A **blocking** product defect found on suite 03's run `s03r3` (fresh data dir, git `618e4c9`).
You do the work; I do not. This is a **new row** — write it into `docs/eval/results/BOARD.md` as **F-111**,
suites `03, 05, 07, 10, 16`, with the measurement below, and then fix it.

Read the measurements first:

- `.kampaku/runs/s03r3/logs/p0-infra.out` — the turn that raised
  `<kampaku-question id="s3-infra-docs-station">` with options *"Keep the five stations / Add s3-infra-docs"*. It
  was answered through the Web UI: `gates auto` reports
  `gate 08a33493-49ac-4719-a1b6-aab20122e899: answered — Keep the five stations…`.
- `.kampaku/runs/s03r3/logs/p1-infra.out` — the next turn, which renders a **different decision** under the
  **same id** (`s3-infra-docs-station`): *"Documentation is the one uncovered aspect with real work behind it …
  how should it be owned?"* with three options.
- `GET /api/v1/questions` on `.kampaku/runs/s03r3/data` afterwards: **one** record, the answered one from p0. The
  p1 question was never stored, and `suite-loop.py --run s03r3 gates auto` reported `0 answered, 0 left pending`
  — nothing to answer anywhere, while the reply the operator read carries a `required: true` gate.
- Same shape again on `p2-infra.out` and `p1-webapp.out` (each re-uses a previous id for a new decision).

## The defect, in one line

`QuestionStore.askEmperor` is idempotent by **question id across all statuses**, and the id is chosen by the
model, so a new decision that re-uses a familiar id is silently dropped: the operator sees a gate in chat that no
surface holds, and the reply looks like a question while being only text.

The two lines that do it, in `apps/core/src/persistence/question-store.ts`:

```ts
if (input.questionId) {
  const existing = this.list().find((candidate) => matchesQuestionId(candidate.question, input.questionId));
  if (existing) return { question: existing, created: false };
}
```

The id is the model's, not the store's, and the check compares the id and nothing else. The comment above it
records why the idempotence exists (a repeating asker looped forever) — that requirement stands; what is wrong is
the **key**.

## Done means

- **A reuse of an id for a different decision is not silently swallowed.** Either the store mints its own id and
  keys idempotence on the decision (the signature `questionSignature` already computes: asker + project +
  normalised prompt), or a non-matching reuse is recorded as a new gate. The `created: false` path must leave a
  trace an operator can read — today it returns the old record and the caller (`session.ts`'s
  `persistEmperorQuestion`) ignores the flag entirely.
- **The loop the idempotence was written for stays closed**: the same decision asked twice under two fresh ids is
  still one gate (that is `questionSignature`'s job, and its tests must keep passing).
- **A rendered gate is either durable or absent.** If a reply carries `<kampaku-question … required: true>` and
  the store refuses to open it, the reply must say the decision is already on record and answered — never a gate
  the operator cannot answer.
- **A lock asserts all three**, in `apps/core/tests/`: same id + different prompt opens a second gate (or states
  on record), same prompt + different ids stays one gate, and a `created: false` return is visible to the caller.
  Verified **red without the fix**.
- **Patched with what was measured**: the new row with the fix, the lock, and the live re-measurement (the same
  two-turn arc against a fresh data dir, reading `GET /api/v1/questions` after each turn), the suite-03 document,
  one reviewable commit on `develop`, conventional commit with a scope. Leave alone what you did not touch.

## Out of scope (each is its own row)

- **[F-062]** — an answered gate not reaching the next turn's context. Own chat.
- **[F-022]** — skill authoring. Own chat.
- **[F-006]** — proposed roster versus created roster. Own chat.
- The web UI's rendering of the question card — it renders what the store gives it.
