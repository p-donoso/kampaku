# Kickoff — take suite __N__, <theme>

Kampaku eval lab. Re-measure **suite __N__** on a fresh data dir and work its blocking rows to the end, without me
in the middle. The `suite-loop` skill in this chat is the procedure; follow it.

Read from disk, in this order: `docs/eval/NEXT-SESSION.md`, `docs/eval/00-protocol.md`,
`docs/eval/__NN-slug__.md` (the emperor prompts verbatim, the oracle, § Result and § Blocker — they may disagree,
and finding out which is true today is the first thing this chat has to do), then the rows of
`docs/eval/results/BOARD.md` whose `suites` column names __NN__.

Facts that are easy to get wrong and are not negotiable:

- the fixture for this suite is **<the fixture path or "the empty directory …">**, not the seed the previous suite
  used;
- the previous run's stack may still be up on its ports — take it down first and say so in the run log;
- gates are answered through the Web UI with `gates auto`, and every choice is written to `logs/gates-answered.md`;
- **the first gate option is taken unless the first option is the thing this suite forbids.** If a gate offers an
  operation the oracle requires the factory to refuse, take the nearest option that is not it, record that the
  temptation existed, and file the row.

Measure, do not assume. The beats of a suite that involves a decision or a gate, in this order:

1. **Preflight** — stack down, fixture at its baseline, endpoint alive, the platform's git SHA recorded.
2. **Fresh run** — `new`, `up`, `seed`, on a new run id and its own ports.
3. **The prompts verbatim**, one bounded `turn` each, with counts before and after every beat
   (`projects / agents / work items / jobs`) and `git status --porcelain` on both trees.
4. **The beat the product's own question gates.** If the product stops to ask which container, which project, or
   who owns the work, that answer is the next beat — not a footnote. Naming an entity the product cannot guess is a
   decision taken by proxy: record it in `logs/gates-answered.md` with the question, the options offered and the
   choice, and report it at the close.
5. **One approval and one rejection**, not a blanket accept: read the remaining `pending` count on chat, CLI **and**
   REST afterwards.
6. **The follow-up prompt** that asks the product to read its own record back, and confirm it answers from durable
   state with **no tool call**.
7. **The surfaces** — the CLI verb, the REST route with the body an operator would send, and the rendered DOM.
8. **The suite's own locks** — run them, and re-run any one of them with its fix reverted if it is new.

Name your iteration count and wall clock now, then run the loop. Stop and bring it to me only for: the suite's own
pass condition met on a fresh data dir; a wall needing a decision the product cannot make (scope, cost,
architecture, a value call); the same row failing twice for the same reason; or your budget spent.

Delivery: a run log in `docs/eval/__NN-slug__.md` in the shape the record already uses (the run that measured the
defect and the run that measured the fix, distinguished), patched BOARD and LEARNINGS rows, evidence in
`.kampaku/runs/<run-id>/logs/`, and one reviewable commit on `develop` with a conventional-commit scope. Leave
alone what you did not touch. Never print `.secrets.webui`. Report the verdict, the bullets that did not hold with
the measurement that says so, the rows opened or closed, and every decision taken on my behalf with the gate that
carried it.

**GitHub stays current — that is part of finishing, not a follow-up.** Every row this run opens is filed as an
issue at the moment it is opened (title `F-<n>: <the defect in a phrase>`, labels `bug` and `eval-finding`); every
row it resolves is closed against a named commit, a lock, and the note saying whether that lock was verified red
with the fix reverted; every row it only moves gets a comment saying which half moved. Before you report, run the
reconciliation in the skill's § *Keeping GitHub current* and paste both mismatch lists — an open row without an
open issue and an open issue without an open row are both failures, and the second is the one that is always
forgotten. Push `develop` and name the SHA: work that lives only on this machine is not evidence. If `gh` is not
authenticated, stop and tell me — do not carry on with the tracker stale.
