import { describe, expect, it } from "vitest";
import {
  inferReadOnlyJob,
  inferRequiresDeliverables,
  bansWriting,
} from "../../src/application/pm/deliverable-requirements.js";

/**
 * **A leaf the plan forbids to write is not a leaf that owes a file.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`, one step from the end. The independent verification leaf's
 * description says, verbatim:
 *
 * > *This leaf must not edit, create or delete anything; if the diff is wider than the two files, or the suite is
 * > not green, stop and report to the lead instead of repairing it.*
 *
 * The job that ran it was dispatched `requiresDeliverables: true`, obeyed the sentence, and was failed
 * `WORKER_NO_DELIVERABLES: The task finished without writing or updating any files in the repository`. Its blocker
 * then froze the leaf and the run stalled with a green checkout.
 *
 * Two holes in the reading, on that one paragraph:
 *
 * 1. the negation reached only the **first** verb of a coordinated list — `must not edit, create or delete` — so
 *    `create` and `delete` still read as requests;
 * 2. *"(expect exactly two **modified** entries and no untracked paths)"* — a noun naming a field `git status`
 *    prints — counted as a request to modify, and no verification leaf can avoid naming what it looks for.
 *
 * A ban on writing with a *generic* object settles both: the leaf does not write, whatever verbs the rest of the
 * paragraph names. A prohibition on a *particular* thing is a constraint on a leaf that does write, and stays one.
 */
const VERIFY_PROSE = [
  "Verify the suite is green and the diff is exactly the two source files",
  "Independent verification pass A, run by an agent that performed none of the repairs. From the checkout root: run " +
    "`./run-tests.sh` (expect exit 0 with every checks/test_*.py passing) and `git status --porcelain` (expect exactly " +
    "two modified entries and no untracked paths). Compare against the git baseline captured in Phase 1 and against " +
    "the stated intent: only src/ledger/parse.py and src/ledger/totals.py may differ, no new top-level directories may " +
    "appear, and no dependency, lockfile or test-framework artifact may exist. This leaf must not edit, create or " +
    "delete anything; if the diff is wider than the two files, or the suite is not green, stop and report to the lead " +
    "instead of repairing it.",
].join("\n\n");

describe("a written ban on writing (suite 19 / s19r22)", () => {
  it("reads the verification leaf's own prohibition, and dispatches it as an observation", () => {
    expect(bansWriting(VERIFY_PROSE)).toBe(true);
    expect(inferReadOnlyJob(VERIFY_PROSE)).toBe(true);
    expect(inferRequiresDeliverables(VERIFY_PROSE)).toBe(false);
  });

  it("reads a coordinated list of banned verbs, and the checkout as their object", () => {
    for (const text of [
      "This leaf must not edit, create or delete anything.",
      "Do not create, modify or delete any file.",
      "write nothing to the checkout",
      "No file in the repository may be changed by this task.",
    ]) {
      expect(bansWriting(text), text).toBe(true);
    }
  });

  it("leaves a prohibition on a particular thing as a constraint on a leaf that still writes", () => {
    for (const text of [
      "Fix the comment handling in src/ledger/parse.py. Do not change the signature of parse_lines.",
      "Add the empty-book guard to totals.py; do not edit the layout or the public interface.",
      "Implement the parser fix. Never modify tools/renumber.py.",
    ]) {
      expect(bansWriting(text), text).toBe(false);
      expect(inferReadOnlyJob(text), text).toBe(false);
    }
  });

  it("keeps the repair leaf that names a read-only probe as a writing leaf", () => {
    const repair = [
      "Skip '#' comment lines in src/ledger/parse.py",
      "Single-file edit in src/ledger/parse.py. Add comment handling: before the colon split, skip any line whose " +
        "stripped form starts with '#'. Leave every other line of the file alone — no reformatting, no f-strings.",
    ].join("\n\n");
    expect(bansWriting(repair)).toBe(false);
    expect(inferRequiresDeliverables(repair)).toBe(true);
  });
});
