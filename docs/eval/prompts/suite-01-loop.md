# Kickoff — suite 01, work-order intake

Kampaku eval lab. Re-measure **suite 01** on a fresh data dir and work its blocking rows to the end, without me in
the middle. The `suite-loop` skill in this chat is the procedure; follow it.

Read from disk, in this order: `docs/eval/NEXT-SESSION.md`, `docs/eval/00-protocol.md`,
`docs/eval/01-work-order-intake.md` (the four emperor prompts verbatim, the oracle, § Result and § Blocker — they
disagree, and finding out which is true today is the first thing this chat has to do), then the rows of
`docs/eval/results/BOARD.md` whose `suites` column names 01.

Three facts that are easy to get wrong and are not negotiable:

- the fixture for this suite is the **empty directory** `/home/pdonoso/projects/eval-intake`, not `eval-seed-py`;
- run `s08r13`'s stack is still up on ports 28083/28005 — take it down first and say so in the run log;
- gates are answered through the Web UI with `gates auto`, and every choice is written to `logs/gates-answered.md`.

Measure, do not assume: read the container back from chat, CLI **and** REST including the id, the owner slug and
the repository path **string**; `git -C /home/pdonoso/kampaku status --porcelain` before and after; counts of
projects/agents/work items/jobs before and after every prompt.

Name your iteration count and wall clock now, then run the loop. Stop and bring it to me only for: the suite's own
pass condition met on a fresh data dir; a wall needing a decision the product cannot make (scope, cost,
architecture, a value call); the same row failing twice for the same reason; or your budget spent.

Delivery: a run log in `docs/eval/01-work-order-intake.md` in the shape the record already uses, patched BOARD and
LEARNINGS rows, evidence in `.kampaku/runs/s01r8/logs/`, and one reviewable commit on `develop` with a
conventional-commit scope. Leave alone what you did not touch. Never print `.secrets.webui`. Report the verdict,
the bullets that did not hold with the measurement that says so, the rows opened or closed, and every decision
taken on my behalf with the gate that carried it.
