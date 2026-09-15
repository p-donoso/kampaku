import { describe, expect, it } from "vitest";
import { requiresDynamicEvidence, requiresProvenance } from "../../src/application/pm/simulation-detection.js";

describe("simulation provenance rules", () => {
  it("identifies requirements needing dynamic evidence", () => {
    expect(requiresDynamicEvidence("Progress persists after completing a workflow")).toBe(true);
    expect(requiresDynamicEvidence("Use the approved color palette")).toBe(false);
  });

  it("identifies deliverables needing provenance", () => {
    expect(requiresProvenance("Generated research document")).toBe(true);
    expect(requiresProvenance("Static layout")).toBe(false);
  });
});
