import { describe, expect, it } from "vitest";
import { buildFinalReport } from "../../src/application/pm/final-report.js";

describe("final project report", () => {
  it("reconciles objective, plan, implementation, and coverage", () => {
    const report = buildFinalReport({ objective: "Deliver outcome", planSummary: "Approved slice", implementationSummary: "Implemented slice", coverage: { verdict: "conditional", requirements: [{ id: "r1", description: "Outcome", status: "covered", evidence: [{ requirementId: "r1", passed: true, verified: true, reference: "report.md" }] }] }, risks: ["Manual review pending"], followUps: ["Add reviewer"] });
    expect(report.markdown).toContain("Verdict: conditional");
    expect(report.markdown).toContain("report.md");
    expect(report.machine.objective).toBe("Deliver outcome");
  });
});
