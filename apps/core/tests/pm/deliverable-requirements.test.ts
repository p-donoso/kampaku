import { describe, expect, it } from "vitest";
import { inferRequiresDeliverables } from "../../src/application/pm/deliverable-requirements.js";

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
});
