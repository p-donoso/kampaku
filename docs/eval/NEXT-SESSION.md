# Resume pointer — suite 19

Current focus, per the operator: suite **19** (brownfield and legacy), run for the first time on
2026-11-05. It is **not scored**. Four runs (`s19r1`–`s19r4`) measured four product gaps; three are
fixed and locked in `c15b9a4`, and the fourth is [F-137](results/BOARD.md) — a project linked to a
checkout outside the factory's granted folders is planned, approved, and can never be written.

This file is only a navigation pointer; the suite protocol owns its verdict and the evaluation board
owns open gaps. Continue with [suite 19](19-brownfield-and-legacy.md) § Blocker, [the run
protocol](00-protocol.md), and the board rows that stand on it: F-137 (grants vs a linked checkout),
F-103 (a dangling `parent_ref` kills `submit_intent`), F-132 (a dependency graph that deadlocks against
its own containers).

Two facts that cost the runs their time, so the next one does not repeat them:

- **Fixture placement.** Both scenarios live in `~/projects/`, which is outside the product's own
  projects folder (`~/kampaku-projects`, granted). Re-running the same two checkouts from the granted
  folder is the cheapest way to reach the first landed fix — and it is a fixture decision, not a
  product change, which is exactly why F-137 is filed as an intake finding.
- **Never drive two turns at once on one data dir.** The 1 m–15 m turn lengths in this session's log
  are wall-clock readings taken while other turns were still running; only the reply is the measurement.
