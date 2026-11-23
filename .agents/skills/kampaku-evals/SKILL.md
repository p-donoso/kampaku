---
name: kampaku-evals
description: Run, author, update, or score Kampaku product evaluation suites. Use when working in docs/eval/, executing a numbered suite, recording evidence, or deciding whether a suite is green or 10/10.
---

# Run and score Kampaku evaluations

The authoritative protocols, gates, order, and latest suite verdicts live in [`docs/eval/`](../../../docs/eval/).
Use this skill as the operator workflow; do not copy verdicts or redefine the scoring bar here.

## Run a suite

1. Read the [lab guide](../../../docs/eval/README.md), [empty-instance protocol](../../../docs/eval/00-protocol.md),
   and the target suite. Check its prerequisites and dependencies against the [board](../../../docs/eval/results/BOARD.md);
   do not start a suite whose dependency has an open blocker.
2. Run one suite at a time, in the documented order. Use a clean checkout and a fresh isolated data directory:

   ```bash
   ./scripts/runs.sh new <run-id>
   source .kampaku/runs/<run-id>/run.env
   ```

   Follow the repo's [CLI skill](../kampaku-cli/SKILL.md) for safe local operation, ports, and process handling.
3. Follow every prompt and beat in the suite. Measure through the operator-facing CLI, documented HTTP, and UI;
   do not use private database state as pass evidence. Configure and report the documented model endpoint when
   the suite claims real model-backed behavior; do not rely on undocumented local shortcuts.
4. Record the commit SHA, isolated data path, provider/model label, platform, start time, and relevant evidence.
   Keep raw output in `.kampaku/runs/<run-id>/`. Promote only meaningful, selected conclusions to
   [`docs/eval/archive/`](../../../docs/eval/archive/) under its archive policy. Routine CI output belongs in
   GitHub Actions.

## Author or update a suite

Use the [suite template](../../../docs/eval/README.md#suite-template). Each suite needs a product-level promise,
why it matters, prerequisites, complete operator prompts, a measurable oracle, public measurement steps, a
10/10 checklist, cited automated tests, binary pass criteria, and a concise latest status. Apply universal gates
U1–U8 and factory gates F1–F5 to every suite, plus any applicable product gates P1–P8. Add a new suite only when
no existing suite owns the promise; otherwise extend that suite and its automated lock. Keep the suite order
index current when adding one.

## Score honestly

- First decide whether every oracle condition passed. Binary pass and numeric score are separate judgments.
- **10/10 requires every applicable gate**: universal U1–U8, factory F1–F5, and in-scope P-gates. There is no
  averaging away a failed gate.
- U4 requires committed automated tests that lock the promise and are cited in the suite's **Automated tests**
  section. No tests, or tests that do not lock the claimed behavior, caps the score at **9**. Manual evidence
  alone also caps at **9**.
- After a product fix, use a fresh data directory and rerun the suite's cited tests. Re-run cited tests for all
  earlier green suites in the same change window; never weaken an earlier oracle to make a later suite pass.
- Any fail or score below 10 belongs on `docs/eval/results/BOARD.md` in product language, with exact evidence.
  Keep the suite's latest verdict concise; archive only selected historical runs. Do not call a suite green unless
  its binary oracle passes **and** its score is 10.
- The full battery is factory-grade only when suites 01–25 are all green and the board has no open blocking rows.

## Keep suite and probe work distinct

A numbered suite is a fixed protocol for comparable scoring. A capability probe is open-ended work used to find
gaps in a hard product goal; follow [`capability-probe-protocol.md`](../../../docs/eval/capability-probe-protocol.md)
for that process. Promote a probe finding to the board or a suite only according to the lab's documented rules.
