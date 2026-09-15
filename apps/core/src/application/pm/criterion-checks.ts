export type CriterionCheckKind = "command" | "artifact" | "endpoint" | "ui" | "manual";

export interface CriterionCheck {
  criterionId: string;
  kind: CriterionCheckKind;
  instruction: string;
  automated: boolean;
  verifier: string;
}

export interface CriterionOutcome {
  criterionId: string;
  status: "passed" | "failed" | "partial" | "blocked" | "unverified";
  evidenceReferences: string[];
}

export function buildCriterionOutcome(check: CriterionCheck, passed: boolean, references: string[] = []): CriterionOutcome {
  return { criterionId: check.criterionId, status: passed ? "passed" : "failed", evidenceReferences: references };
}

export function validateCriterionCompletion(criteria: CriterionCheck[], outcomes: CriterionOutcome[]): { ok: boolean; missing: string[]; invalid: string[] } {
  const byId = new Map(outcomes.map((outcome) => [outcome.criterionId, outcome]));
  const missing = criteria.map((criterion) => criterion.criterionId).filter((id) => !byId.has(id));
  const invalid = outcomes.filter((outcome) => outcome.status !== "passed" || outcome.evidenceReferences.length === 0).map((outcome) => outcome.criterionId);
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function parseCriterionChecks(criteria: Array<{ id: string; text: string }>): CriterionCheck[] {
  return criteria.map(({ id: criterionId, text }) => {
    const lower = text.toLowerCase();
    const kind: CriterionCheckKind = /npm |pytest|cargo test|go test|run_check|command|script/.test(lower)
      ? "command"
      : /endpoint|api|url|http/.test(lower)
        ? "endpoint"
        : /ui|screen|page|form|navigate|click|render|browser/.test(lower)
          ? "ui"
          : /file exists|document exists|artifact|\.md\b|\.pdf\b|\.png\b|\.csv\b/.test(lower)
            ? "artifact"
            : "manual";
    const verifier = {
      command: "run_check",
      artifact: "verify_artifact",
      endpoint: "request_endpoint",
      ui: "inspect_ui",
      manual: "request_review",
    }[kind];
    return { criterionId, kind, instruction: text, automated: kind === "command" || kind === "artifact", verifier };
  });
}
