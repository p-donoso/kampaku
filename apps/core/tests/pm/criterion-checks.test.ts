import { describe, expect, it } from "vitest";
import { buildCriterionOutcome, parseCriterionChecks, validateCriterionCompletion } from "../../src/application/pm/criterion-checks.js";

describe("criterion check parsing", () => {
  it("routes heterogeneous criteria without assuming software", () => {
    const checks = parseCriterionChecks([
      { id: "ac-1", text: "npm test passes" },
      { id: "ac-2", text: "Document exists at docs/brief.pdf" },
      { id: "ac-3", text: "Reviewer confirms the interview is accurate" },
    ]);
    expect(checks.map((check) => check.kind)).toEqual(["command", "artifact", "manual"]);
    expect(checks[0].automated).toBe(true);
    expect(checks[2].automated).toBe(false);
    expect(checks.map((check) => check.verifier)).toEqual(["run_check", "verify_artifact", "request_review"]);
  });

  it("keeps criterion outcomes linked to evidence references", () => {
    const check = parseCriterionChecks([{ id: "ac-1", text: "Document exists at docs/brief.pdf" }])[0];
    expect(buildCriterionOutcome(check, true, ["docs/brief.pdf"])).toEqual({ criterionId: "ac-1", status: "passed", evidenceReferences: ["docs/brief.pdf"] });
  });

  it("rejects missing, failed, and unverified criteria", () => {
    const checks = parseCriterionChecks([{ id: "ac-1", text: "npm test passes" }, { id: "ac-2", text: "Reviewer confirms the result" }]);
    const result = validateCriterionCompletion(checks, [buildCriterionOutcome(checks[0], false)]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["ac-2"]);
    expect(result.invalid).toEqual(["ac-1"]);
  });

  it("supports a mixed verification workflow", () => {
    const checks = parseCriterionChecks([
      { id: "ac-command", text: "npm test passes" },
      { id: "ac-artifact", text: "Document exists at docs/report.pdf" },
      { id: "ac-endpoint", text: "Endpoint /health responds with status 200" },
      { id: "ac-ui", text: "UI page renders the result" },
      { id: "ac-manual", text: "Reviewer confirms the decision" },
    ]);
    expect(checks.map((check) => check.verifier)).toEqual(["run_check", "verify_artifact", "request_endpoint", "inspect_ui", "request_review"]);
  });
});
