# Eval results and run records

This directory holds **curated, durable evaluation state**, not suite specifications or every CI
execution log.

| File | Role |
|------|------|
| [`BOARD.md`](BOARD.md) | Open product gaps found while running suites or probes |
| [`LEARNINGS.md`](LEARNINGS.md) | Current evaluation learnings and dispositions |

## Where execution evidence lives

- GitHub Actions owns routine CI output. Each CI run publishes a job summary and a JUnit report
  artifact for the automated evaluation tests. The artifact is retained for 30 days; the run page
  contains the step logs and summary.
- Keep suite protocols and current product gaps in this repository. Keep a manual run record here
  only when it establishes a meaningful verdict, changes a board row, or supports a durable
  decision. Include its date, commit, environment, verdict, and links to relevant evidence.
- Do not copy routine CI logs or every retry into Git. If a result is needed beyond artifact
  retention, preserve its conclusion and reproducibility details in the relevant suite or board.

Suite protocols, the factory contract, and the probe protocol live in the parent
[`docs/eval/`](../) directory (`00-protocol.md` … `25-factory-arc.md`).

## When you green a suite

1. Update the suite's **Result**, **Evidence**, and score; add a concise run-log entry only for a
   meaningful milestone.
2. Add or close rows in [`BOARD.md`](BOARD.md) — blocking gaps only, in product language.
3. Append deferred elevation ideas to [`LEARNINGS.md`](LEARNINGS.md).
4. Keep pass criteria and evidence in the suite file itself; this directory never holds an oracle.
