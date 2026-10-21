# Next session — take suite 10

Kampaku eval lab. **Suite 09 is green at 10/10 on run `s09r8` (2026-10-21)**; the next unrun suite in order is
**10 — human in the loop**.

Read these first, in this order:

1. `docs/eval/README.md` — how the lab runs, what a score means, what the protocol demands.
2. `docs/roadmap/README.md` § **Resume here** — where the work stands. Its `Next action` names what is left.
3. `docs/eval/10-human-in-the-loop.md` — the suite itself.
4. `docs/eval/09-shared-truth.md` § **Iterations** — the shape to follow when a suite needs several runs: every run
   recorded, every fix named, and the run that scored distinguished from the runs that found things.
5. `docs/eval/00-protocol.md` — the run protocol, including what a fresh data dir means.
6. `docs/eval/results/BOARD.md` — the rows. Run `suite-loop.py blockers --suite 10` for the candidate list; a row whose
   `suites` cell names 10 but whose notes say it does not block it is not the loop's business.

Two things this session established and the next one should not re-learn:

- **`s09r8` was measured on a working tree.** The verdict is honest (fresh data dir, own ports, nothing patched mid-run)
  but its SHA is `2afb0bc` + this change set. If suite 10's work moves the knowledge surface, re-run 09 on a fresh data
  dir rather than inheriting the score.
- **A suite can pass while its neighbouring rows stay open.** `F-072` is `open` and no longer claims suite 09; `F-077` is
  `open` and is what holds suite 08 at 7/10. Neither blocks 10 unless its own notes say so.
