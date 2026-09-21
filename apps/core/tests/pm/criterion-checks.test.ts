import { describe, expect, it } from "vitest";
import { buildCriterionOutcome, parseCriterionChecks, validateCriterionCompletion } from "../../src/application/pm/criterion-checks.js";

describe("criterion check parsing", () => {
  it("routes heterogeneous criteria without assuming software", () => {
    const checks = parseCriterionChecks([
      { id: "ac-1", text: "npm test passes" },
      { id: "ac-2", text: "Document exists at docs/brief.pdf" },
      { id: "ac-3", text: "Reviewer confirms the interview is accurate" },
    ]);
    expect(checks.map((check) => check.kind)).toEqual(["command", "document", "manual"]);
    expect(checks[0].automated).toBe(true);
    expect(checks[2].automated).toBe(false);
    expect(checks.map((check) => check.verifier)).toEqual([
      "run_check",
      "inspect_document",
      "request_review",
    ]);
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
      { id: "ac-artifact", text: "Document exists at docs/notes.md" },
      { id: "ac-document", text: "Report states the benchmark latency" },
      { id: "ac-image", text: "Screenshot shows the rendered dashboard" },
      { id: "ac-media", text: "Audio file reports a duration under 30 seconds" },
      { id: "ac-dataset", text: "Dataset row count is 120 with no duplicate id" },
      { id: "ac-endpoint", text: "Endpoint /health responds with status 200" },
      { id: "ac-ui", text: "UI page renders the result" },
      { id: "ac-manual", text: "Reviewer confirms the decision" },
    ]);
    expect(checks.map((check) => check.verifier)).toEqual([
      "run_check",
      "inspect_artifact",
      "inspect_document",
      "inspect_image",
      "inspect_media",
      "query_dataset",
      "request_endpoint",
      "inspect_ui",
      "request_review",
    ]);
    expect(checks.filter((check) => !check.automated).map((check) => check.criterionId)).toEqual(["ac-manual"]);
  });
});
