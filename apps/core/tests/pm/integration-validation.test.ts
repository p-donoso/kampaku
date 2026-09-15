import { describe, expect, it } from "vitest";
import { validateIntegrationScenarios } from "../../src/application/pm/integration-validation.js";

describe("integration validation", () => {
  it("requires primary, failure, recovery, boundaries, and evidence", () => {
    const report = validateIntegrationScenarios([
      { id: "primary", kind: "primary", outcome: "Primary outcome works", boundaries: ["input", "result"], passed: true, evidence: "primary.log" },
      { id: "failure", kind: "failure", outcome: "Failure is reported", boundaries: ["request", "error"], passed: true, evidence: "failure.log" },
      { id: "recovery", kind: "recovery", outcome: "Recovery works", boundaries: ["retry", "result"], passed: true, evidence: "recovery.log" },
    ]);
    expect(report.ok).toBe(true);
  });

  it("rejects a compile-only result without an end-to-end scenario", () => {
    const report = validateIntegrationScenarios([{ id: "build", kind: "primary", outcome: "Build passes", boundaries: ["build"], passed: true }]);
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContain("Missing failure integration scenario.");
  });
});
