# Next session — the next suite in order

Kampaku eval lab. **Green at 10/10 on a fresh data dir:** 01, 02, 03, 04, 07, 09, 10, 11, 12. **Below 10:** 06 at
6/10, 08 at 7/10 with its binary not met. **Not run:** 13–25, because 13's prereq is 08 green and 08 is not.

So the next session's work is **08** — the oldest thing standing between the lab and the rest of the battery — and
then 13. `suite-loop.py blockers --suite 08` is the candidate list; it is prose, so read the rows by eye.

Read these first, in this order:

1. `docs/eval/README.md` — how the lab runs, what a score means, what the protocol demands.
2. `docs/roadmap/README.md` § **Resume here** — where the work stands.
3. `docs/eval/00-protocol.md` — the run protocol: a fresh data dir, and § *What a durable record owes the next
   turn*, which is what suite 12 left behind.
4. The suite itself: `docs/eval/08-hands-off-execution.md` — § **Result**, § **Blocker**, § **Oracle**.
5. `docs/eval/12-scope-and-approval.md` § *Run log* — the shape to follow for a suite that needs two runs: the run
   that measured the defect and the run that measured the fix, both recorded, distinguished from each other.
6. `docs/eval/results/BOARD.md` § **Status legend**, then `suite-loop.py blockers --suite 08`.

Kickoff brief to paste into a fresh chat: [`prompts/suite-loop-kickoff.md`](prompts/suite-loop-kickoff.md).

Four things this session established and the next one should not re-learn:

- **A bundled ask cannot be scoped, and that is a defect, not a weak answer.** Suite 12's first run parked four
  expansions as one question with five *combination* options; the oracle's "the approval is scoped" bullet became
  unmeasurable. One ask, one record, one decision — and read the number of ids the turn produced.
- **A refusal offered as a gate option is not a refusal.** Score it on the store's status (`refused`) and on the
  route's answer (`400`), never on the reply's prose. The loop's `gates auto` takes the first option *unless the
  first option is the thing the suite forbids*.
- **The follow-up turn is the read-back.** A prompt like *"show me what each item would touch"* must be answerable
  from the durable-state block with no tool call. *"The four asks are not retrievable from any store either of us
  can read"* is the failing sentence, and it is quotable.
- **A lock at the store is not a lock at the surface.** Suite 12's decision route answered `500` on every call
  while its store-level lock was green, because the route declared no body fields. Anything measured through a
  route gets a test that crosses it.

A suite can pass while its neighbouring rows stay open. `blockers` marks rows `unreadable` or `ambiguous(<…>)`
instead of guessing; a row whose notes say it does not block this suite is not this run's business even when its
`suites` column names it.
