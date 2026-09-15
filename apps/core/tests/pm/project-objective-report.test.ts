import { describe, expect, it } from "vitest";
import { buildObjectiveCoverageReport } from "../../src/application/pm/project-objective-audit.js";

describe("objective coverage report", () => {
  it("produces human and machine readable coverage", () => {
    const report = buildObjectiveCoverageReport("Deliver a usable research brief", [{ id: "brief", description: "Research brief", critical: true }], [{ requirementId: "brief", passed: true, verified: true, reference: "docs/brief.md" }]);
    expect(report.verdict).toBe("pass");
    expect(report.markdown).toContain("Verdict: pass");
    expect(report.markdown).toContain("docs/brief.md");
    expect(report.machine.requirements[0].status).toBe("covered");
  });
});
