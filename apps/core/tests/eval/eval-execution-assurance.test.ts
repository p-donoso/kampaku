import { describe, expect, it } from "vitest";
import { evaluateQualityGate } from "../../src/application/pm/quality-gates.js";
import { auditObjectiveCoverage, normalizeObjectiveRequirements } from "../../src/application/pm/project-objective-audit.js";
import { validateScope, createScopeChange } from "../../src/application/pm/scope-tracking.js";
import { nextBlockerStatus, canRequeueWorkItem } from "../../src/application/pm/blocker-recovery.js";
import { canExecuteBlockerTriage } from "../../src/application/pm/blocker-triage.js";
import { createVerificationRequest, createVerificationResult } from "../../src/application/pm/verification-adapters.js";
import { isEvidenceKind } from "../../src/application/pm/evidence-registry.js";

describe("execution assurance eval contract", () => {
  it("rejects completion without verified, referenced evidence", () => {
    expect(evaluateQualityGate({ requiredChecks: { tests: true }, evidence: [{ passed: true, verified: false }] }).ok).toBe(false);
    expect(evaluateQualityGate({ requiredChecks: { tests: true }, evidence: [{ passed: true, verified: true, reference: "ci://run/1" }] }).ok).toBe(true);
  });

  it("fails critical objective gaps and passes only referenced coverage", () => {
    const requirements = normalizeObjectiveRequirements("Provide a reliable workflow.\nSupport recovery.");
    expect(auditObjectiveCoverage(requirements, []).verdict).toBe("fail");
    expect(auditObjectiveCoverage(requirements, requirements.map((r) => ({ requirementId: r.id, passed: true, verified: true, reference: `test://${r.id}` }))).verdict).toBe("pass");
  });

  it("requires explicit reasons for scope changes and records them", () => {
    expect(validateScope([{ id: "r1", description: "A", status: "deferred" }]).ok).toBe(false);
    expect(createScopeChange("r1", "planned", "deferred", "Needs operator decision").reason).toBe("Needs operator decision");
  });

  it("keeps blocker recovery bounded and requeue-safe", () => {
    expect(nextBlockerStatus("pending", "resolve")).toBe("resolved");
    expect(canRequeueWorkItem("resolved", false)).toBe(true);
    expect(canRequeueWorkItem("resolved", true)).toBe(false);
  });

  it("does not treat an unavailable triage recipient as blocker resolution", () => {
    expect(canExecuteBlockerTriage("kampaku", ["resolve_blocker"])).toBe(false);
    expect(canExecuteBlockerTriage("project-lead", [])).toBe(false);
    expect(canExecuteBlockerTriage("project-lead", ["resolve_blocker"])).toBe(true);
  });

  it("uses generic verification capabilities and evidence kinds", () => {
    const request = createVerificationRequest("browser", "ac-1", "workflow");
    const result = createVerificationResult(request, true, "browser://run/1");
    expect(result.capability).toBe("browser");
    expect(isEvidenceKind("behavior")).toBe(true);
    expect(isEvidenceKind("software-only-slug")).toBe(false);
  });
});
