import { describe, expect, it } from "vitest";
import { validateVerticalSlice, validateVerticalSlicePlan } from "../../src/delegator/vertical-slice.js";
import { validatePlan } from "../../src/delegator/plan-validation.js";

describe("vertical slices", () => {
  it("accepts a cross-boundary observable outcome", () => {
    expect(validateVerticalSlicePlan([{ id: "slice-1", title: "Complete a lesson", outcome: "Learner completes one lesson and sees saved progress", requirementIds: ["req-lesson"], workItemIds: ["ui", "api", "data"], evidenceKinds: ["ui", "behavior", "artifact"] }]).ok).toBe(true);
  });

  it("rejects technical-only slices", () => {
    const result = validateVerticalSlice({ id: "slice-1", title: "Database layer", outcome: "", requirementIds: [], workItemIds: ["db"], evidenceKinds: ["check"] });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("Slice must define an observable outcome.");
  });

  it("can require slices at a plan gate", () => {
    const result = validatePlan({ work_items: [{ title: "Phase", description: "Container" }] }, { intent: "Deliver an outcome", granularity: "standard", mode: "incremental", requireVerticalSlices: true });
    expect(result.issues.some((issue) => issue.code === "invalid_vertical_slice")).toBe(true);
  });
});
