import { describe, expect, it } from "vitest";
import {
  inferReadOnlyJob,
  inferRequiresDeliverables,
  isEvidenceOnlyObjective,
} from "../../src/application/pm/deliverable-requirements.js";

describe("inferRequiresDeliverables", () => {
  it("defaults to requiring deliverables for coding tasks", () => {
    expect(inferRequiresDeliverables("Implement core API endpoints")).toBe(true);
    expect(inferRequiresDeliverables("Documentar API")).toBe(true);
  });

  it("allows explicit read-only objectives", () => {
    expect(inferRequiresDeliverables("Review only: summarize current API routes")).toBe(false);
    expect(inferRequiresDeliverables("Investigate only why build fails")).toBe(false);
  });

  it("allows a verification task that explicitly writes no files", () => {
    expect(
      inferRequiresDeliverables(
        "Boundary verification and full-workspace test gate, writing no files. Run npm test --workspaces.",
      ),
    ).toBe(false);
  });

  /**
   * The hyphen, measured — suite 19 run `s19r16`.
   *
   * A verification slice opened `VERIFICATION-ONLY slice` and said in the same paragraph `writes no file at all`.
   * Neither frame matched (`verification only` wanted a space; `write no files` wanted the singular verb), so the
   * leaf read as a writing leaf. A writing leaf is then refused for landing no file, so the plan's own lead amended
   * the leaf to write `docs/evidence/…` inside the checkout it exists to prove untouched — one missed hyphen, one
   * new top-level entry in a legacy tree.
   */
  it("recognises the hyphenated and third-person forms a plan actually writes", () => {
    const measured = [
      'VERIFICATION-ONLY slice, amended after blocker 1e6fcf94 (reason: the platform rejects a job that writes nothing). Current state of D1, verified by reading the checkout. Do NOT edit, reformat, refactor, or rewrite src/ledger/parse.py.',
      "This leaf is a VERIFICATION-ONLY pass over the checkout and writes no file at all inside it.",
      "Read-only inspection of the tree; it writes no file.",
    ];
    for (const objective of measured) {
      expect(inferRequiresDeliverables(objective), objective).toBe(false);
      expect(inferReadOnlyJob(objective), objective).toBe(true);
    }
    // The control: a leaf that edits a file is still a writing leaf, whatever else it says.
    expect(
      inferRequiresDeliverables("Fix defect D1 in src/ledger/parse.py so the parse check passes."),
    ).toBe(true);
  });

  it("allows an independent verification task that makes no source edits", () => {
    expect(
      inferRequiresDeliverables(
        "Independent verification only — make NO source edits. Run the declared checks and report evidence.",
      ),
    ).toBe(false);
  });

  /**
   * The other half of the same reading, and the one that was missing on suite 19 `s19r6` (BOARD F-093).
   *
   * An exemption from the deliverables rule is not a constraint: the evidence-only audit job was let through
   * the gate and then succeeded by writing an unrequested report into the checkout. The two answers come from
   * one pattern so they cannot disagree — a job exempted from writing is exactly the job refused at the boundary.
   */
  it("marks the same objectives read-only for the write boundary, and nothing else", () => {
    const measured = [
      "Boundary verification and full-workspace test gate, writing no files. Run npm test --workspaces.",
      "Independent verification only — make NO source edits. Run the declared checks and report evidence.",
      "Review only: summarize current API routes",
      "Evidence-only audit of the order contract",
    ];
    for (const objective of measured) {
      expect(inferReadOnlyJob(objective), objective).toBe(true);
      expect(isEvidenceOnlyObjective(objective), objective).toBe(true);
      expect(inferRequiresDeliverables(objective), objective).toBe(false);
    }

    // The control: a repair objective is a writing job, however much verification it mentions.
    for (const objective of [
      "Bring the checkout to a working state: fix the smallest set of things needed.",
      "Add a small feature to the orders package and include the checks you will use.",
      "Fix total([]) to return 0 and verify with ./run-tests.sh",
    ]) {
      expect(inferReadOnlyJob(objective), objective).toBe(false);
      expect(inferRequiresDeliverables(objective), objective).toBe(true);
    }
  });
});
