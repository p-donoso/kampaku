# Resume pointer — suite 19

Current focus: suite **19** (brownfield and legacy). Runs `s19r5` and `s19r6` continued the suite on
fresh copies inside the granted projects folder. The legacy repairs and monorepo feature now pass
their repository checks, and prompts 1–5 have been driven across the two runs. The suite remains **not
scored**: F-137 still covers checkouts outside grants, F-093 remains open, the final classifier
refinement needs a clean fresh-data-dir no-write measurement, and the M phase-audit gate is pending.

This file is only a navigation pointer; the suite protocol owns its verdict and the evaluation board
owns open gaps. Continue with [suite 19](19-brownfield-and-legacy.md) § Continued runs and § Blocker,
[the run protocol](00-protocol.md), and board rows F-137 (grants vs a linked checkout), F-093
(no-deliverable job failure), F-103 (dangling `parent_ref`), and F-132 (dependency graph deadlock).

Two facts that cost the runs their time, so the next one does not repeat them:

- **Fresh copies and data dirs.** `s19r5` copied both fixtures under
  `/home/pdonoso/kampaku-projects/s19r5`; `s19r6` copied the monorepo under
  `/home/pdonoso/kampaku-projects/s19r6`. The original checkouts remain untouched.
- **Serial turns.** Each model turn completed before the next began. Continue this discipline on the
  fresh-data-dir classifier rerun.
