import { describe, expect, it } from "vitest";
import { EVIDENCE_SUBJECT_TYPES, isEvidenceKind } from "../../src/application/pm/evidence-registry.js";

describe("evidence registry", () => {
  it("supports project-agnostic evidence kinds", () => {
    expect(EVIDENCE_SUBJECT_TYPES).toContain("artifact");
    expect(isEvidenceKind("behavior")).toBe(true);
    expect(isEvidenceKind("unknown")).toBe(false);
  });

});
