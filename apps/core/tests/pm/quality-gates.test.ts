import { describe, expect, it } from "vitest";
import { detectPlaceholderContent, evaluateQualityGate, hasMeaningfulContent, requiresBehaviorEvidence } from "../../src/application/pm/quality-gates.js";

describe("quality gates", () => {
  it("rejects incomplete and placeholder results", () => {
    const result = evaluateQualityGate({ iterationLimitReached: true, content: "Welcome to the demo", requiredChecks: { test: false } });
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(4);
    expect(detectPlaceholderContent("Test Button")).toBe(true);
    expect(hasMeaningfulContent("short")).toBe(false);
    expect(requiresBehaviorEvidence("The UI page renders the workflow")).toBe(true);
  });

  it("accepts complete referenced evidence", () => {
    expect(evaluateQualityGate({ requiredChecks: { test: true }, evidence: [{ passed: true, verified: true, reference: "report.md" }] }).ok).toBe(true);
  });
});
