# Eval results and run artifacts

This directory holds **operational evaluation state**, not suite specifications.

| File | Role |
|------|------|
| [`BOARD.md`](BOARD.md) | Open and historical product gaps found while running suites or probes |
| [`LEARNINGS.md`](LEARNINGS.md) | Elevation ideas and dispositions, with the archived battery's learnings re-mapped |

Suite protocols, the factory contract, and the probe protocol live in the parent
[`docs/eval/`](../) directory (`00-protocol.md` … `25-factory-arc.md`).

Superseded suites and the previous battery's learnings are preserved under
[`../archive/`](../archive/README.md).

## When you green a suite

1. Update the suite's own **Run log**, **Result**, **Evidence**, and score.
2. Add or close rows in [`BOARD.md`](BOARD.md) — blocking gaps only, in product language.
3. Append deferred elevation ideas to [`LEARNINGS.md`](LEARNINGS.md).
4. Keep pass criteria and evidence in the suite file itself; this directory never holds an oracle.
