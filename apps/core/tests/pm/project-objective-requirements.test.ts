import { describe, expect, it } from "vitest";
import { auditObjectiveCoverage, normalizeObjectiveRequirements, assertObjectiveCompletion } from "../../src/application/pm/project-objective-audit.js";

describe("objective requirements", () => {
  it("normalizes objective lines into stable requirements", () => {
    const requirements = normalizeObjectiveRequirements("Build a research brief. Publish the findings.");
    expect(requirements).toHaveLength(2);
    expect(requirements[0].id).toMatch(/^req-1-/);
  });

  it("requires a reference for covered evidence", () => {
    const result = auditObjectiveCoverage([{ id: "r", description: "Requirement", critical: true }], [{ requirementId: "r", passed: true, verified: true }]);
    expect(result.verdict).toBe("fail");
    expect(() => assertObjectiveCompletion(result)).toThrow();
  });
});
