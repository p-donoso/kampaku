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
