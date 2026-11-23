import { describe, expect, it } from "vitest";
import { resolveJobWritingPolicy } from "../../src/planner/create-goal.js";

/**
 * **The wording of a leaf's evidence does not decide what the leaf is.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`, on the legacy checkout's parse repair. The leaf's own description says
 * *"Single-file edit in src/ledger/parse.py … Add comment handling: before the colon split, skip any line whose
 * stripped form starts with '#'"* — a change, stated plainly. Its criterion `ac-3` says *"A **read-only probe** quoted
 * in the completion report shows a comment line producing no row: `PYTHONPATH=src python3 -c …`"* — a sentence about
 * a **command**, not about the leaf.
 *
 * The narrow evidence-wording pattern matched `read-only`, so the job was dispatched
 * `readOnly: true` / `requiresDeliverables: false`, and its report is the whole defect in one line: *"Report: blocked —
 * job is read-only, change cannot be applied … the write tools refuse this job"*. Nothing was written for a repair the
 * plan had ordered, and the very next leaf in the same phase — the identical one-line repair to
 * `src/ledger/totals.py` — succeeded, because its criteria happened not to contain the phrase.
 *
 * A criterion is an assertion about **evidence**, and its vocabulary is the vocabulary of commands. So the obligation
 * is read from the leaf's prose — title and description — and the caller that holds them apart passes them.
 */
const PROSE = [
  "Skip '#' comment lines in src/ledger/parse.py",
  "Single-file edit in src/ledger/parse.py, the file that reproduces failure H1. parse_lines() currently runs " +
    "`label, amount = line.split(\":\")` on every non-blank line. Add comment handling: before the colon split, skip " +
    "any line whose stripped form starts with '#'. Keep the `def parse_lines(text)` signature and leave every other " +
    "line of the file alone. Verify with `PYTHONPATH=src python3 checks/test_parse.py`, which must exit 0.",
].join("\n\n");

const CRITERION =
  "A read-only probe quoted in the completion report shows a comment line producing no row: " +
  '`PYTHONPATH=src python3 -c "from ledger.parse import parse_lines; print(len(parse_lines(\'# note\\ncoffee:3.50\')))"` prints 1.';

describe("reading a leaf's obligation from its prose (suite 19 / s19r22)", () => {
  it("dispatches a stated repair as a writing job even when a criterion mentions a read-only probe", () => {
    // The measured shape: objective-as-title+description+criteria, which is what `buildObjective` produces.
    expect(resolveJobWritingPolicy({ prose: `${PROSE}\n\n- [ac-3] ${CRITERION}` })).toEqual({
      readOnly: true,
      requiresDeliverables: false,
    });
    // The prose alone, which is what the caller now passes.
    expect(resolveJobWritingPolicy({ prose: PROSE })).toEqual({
      readOnly: false,
      requiresDeliverables: true,
    });
  });

  it("still reads a leaf whose own prose says it observes as an observation", () => {
    for (const prose of [
      "Verification only — make NO source edits; run ./run-tests.sh and record the output",
      "Read-only probe of the checkout: run ./run-tests.sh and quote its verbatim output",
      "Audit the change set for no file changes and report the diff",
    ]) {
      expect(resolveJobWritingPolicy({ prose }), prose).toEqual({ readOnly: true, requiresDeliverables: false });
    }
  });

  it("keeps a structural answer winning over any prose", () => {
    expect(resolveJobWritingPolicy({ prose: PROSE, observationOnly: true })).toEqual({
      readOnly: true,
      requiresDeliverables: false,
    });
  });
});
