import { describe, expect, it } from "vitest";
import {
  inferReadOnlyJob,
  inferRequiresDeliverables,
  requiresCleanCheckout,
} from "../../src/application/pm/deliverable-requirements.js";

/**
 * **A leaf required to leave an empty tree cannot owe a file.**
 *
 * Measured 2026-11-23 on suite 19's run `s19r25`, on `A2 — Execute declared checks and capture baseline failures`.
 * Its description says, verbatim:
 *
 * > *do not edit source; do not create any evidence file in the checkout … Phase A must leave the checkout
 * > byte-identical (`git status --porcelain` empty).*
 *
 * and its `ac-4` reads *"`git status --porcelain` reported at the end of this leaf is empty."* The dispatch carried
 * `requiresDeliverables: true` anyway. The agent obeyed every line, reported the failing output, wrote nothing — and
 * the job was failed `WORKER_NO_DELIVERABLES`. The plan's lead had even written the workaround into the leaf: *"A job
 * that ends with zero repository mutations may be rejected by the worker pipeline … that rejection is expected"*.
 * It is not expected; it is the product asking for two mutually exclusive things.
 *
 * The refusal this row records is the shape, not the spelling: a criterion that requires `git status --porcelain`
 * to be empty, or a description that requires the checkout to stay untouched, states that the leaf may not write.
 * No verb list can enumerate every way a plan says so, and it should not have to.
 *
 * This is the narrow case only. A criterion's ordinary vocabulary — *"a read-only probe shows …"*, *"`make check`
 * exits 0"* — still does not decide a leaf's obligation (BOARD F-157), and the case below is the control for that.
 */
const A2_PROSE = [
  "A2 — Execute declared checks and capture baseline failures",
  "",
  "Run the only supported check command from the repository root — `./run-tests.sh` — and capture its numeric exit " +
    "status plus verbatim stdout/stderr, then each check individually. Every later fix leaf must be tied back to one " +
    "of the failures recorded here. Do not introduce any other runner or dependency; do not edit source; do not " +
    "create any evidence file in the checkout. This leaf consumes A1's command vocabulary and unblocks the whole " +
    "fix sequence.",
  "",
  "LEAD NOTE: Phase A must leave the checkout byte-identical (`git status --porcelain` empty). Report the captured " +
    "output in your completion report; do not add files, directories, or docs/ to the checkout.",
].join("\n\n");

const A2_CRITERIA = [
  "The completion report contains, for each failing check, the exact command, its numeric exit status, and the " +
    "verbatim error text.",
  "The completion report quotes the exit status of `./run-tests.sh` as a whole.",
  "The completion report states explicitly which of the three invocations passed, if any.",
  "`git status --porcelain` reported at the end of this leaf is empty.",
];

describe("a leaf that requires an empty tree owes no file (F-161, re-measured on s19r25)", () => {
  it("reads the clean-tree requirement in a criterion", () => {
    expect(requiresCleanCheckout(A2_CRITERIA[3])).toBe(true);
    // The other spellings a plan uses for the same requirement.
    expect(requiresCleanCheckout("git status --porcelain must be empty at the end of the leaf.")).toBe(true);
    expect(requiresCleanCheckout("The report shows git status --porcelain produced no output.")).toBe(true);
    expect(requiresCleanCheckout("The checkout remains untouched and the layout is unchanged.")).toBe(true);
    expect(requiresCleanCheckout("No files were created, modified or deleted.")).toBe(true);
  });

  it("does not fire on a criterion that merely names the command", () => {
    // The control for F-157: naming `git status --porcelain` as something to quote says nothing about obligation.
    expect(requiresCleanCheckout("The completion report quotes `git status --porcelain` and its output.")).toBe(false);
    expect(requiresCleanCheckout("`./run-tests.sh` exits 0 and both checks print ok.")).toBe(false);
  });

  it("dispatches A2 as an observation, from its prose and its criteria together", () => {
    expect(inferRequiresDeliverables(A2_PROSE, A2_CRITERIA)).toBe(false);
    expect(inferReadOnlyJob(A2_PROSE, A2_CRITERIA)).toBe(true);
  });

  it("keeps a repair leaf that quotes a check and asks for the fix", () => {
    const repairProse = [
      "B1 — Skip '#' comment lines in src/ledger/parse.py",
      "",
      "Change src/ledger/parse.py so that a line whose first non-space character is `#` contributes no row. The " +
        "layout and the public interface stay as they are.",
    ].join("\n\n");
    const repairCriteria = [
      "`PYTHONPATH=src python3 checks/test_parse.py` exits 0 and the report quotes the verbatim output.",
      "`git diff --stat` shows only src/ledger/parse.py modified.",
    ];
    expect(inferRequiresDeliverables(repairProse, repairCriteria)).toBe(true);
    expect(inferReadOnlyJob(repairProse, repairCriteria)).toBe(false);
  });
});
