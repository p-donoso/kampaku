import { describe, expect, it } from "vitest";
import { auditObjectiveCoverage } from "../../src/application/pm/project-objective-audit.js";

describe("project objective coverage audit", () => {
  it("fails when a critical requirement is not covered", () => {
    const result = auditObjectiveCoverage(
      [{ id: "roadmap", description: "A usable roadmap", critical: true }, { id: "docs", description: "Documentation" }],
      [{ requirementId: "docs", passed: true, verified: true, reference: "README.md" }],
    );
    expect(result.verdict).toBe("fail");
    expect(result.requirements.find((row) => row.id === "roadmap")?.status).toBe("missing");
  });

  it("returns conditional when only non-critical requirements lack verification", () => {
    const result = auditObjectiveCoverage(
      [{ id: "core", description: "Core", critical: true }, { id: "polish", description: "Polish" }],
      [{ requirementId: "core", passed: true, verified: true, reference: "src/core.ts" }],
    );
    expect(result.verdict).toBe("conditional");
    expect(result.requirements.find((row) => row.id === "polish")?.status).toBe("missing");
  });

  it("classifies partial, blocked, and unverified requirements", () => {
    const result = auditObjectiveCoverage(
      [
        { id: "partial", description: "Partial requirement" },
        { id: "blocked", description: "Blocked requirement" },
        { id: "unverified", description: "Unverified requirement" },
      ],
      [
        { requirementId: "partial", passed: false, verified: true, reference: "review" },
        { requirementId: "blocked", passed: false, verified: false, blocked: true, reference: "job-1" },
        { requirementId: "unverified", passed: true, verified: false, reference: "claim" },
      ],
    );
    expect(result.requirements.map((row) => row.status)).toEqual(["partial", "blocked", "unverified"]);
    expect(result.verdict).toBe("conditional");
  });

  it("passes only when every requirement has verified referenced evidence", () => {
    const result = auditObjectiveCoverage(
      [{ id: "one", description: "One", critical: true }, { id: "two", description: "Two" }],
      [
        { requirementId: "one", passed: true, verified: true, reference: "artifact-1" },
        { requirementId: "two", passed: true, verified: true, reference: "artifact-2" },
      ],
    );
    expect(result.verdict).toBe("pass");
  });
});
