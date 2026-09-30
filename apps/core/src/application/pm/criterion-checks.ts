import { isObservableCriterion } from "./criterion-observability.js";

export type CriterionCheckKind =
  | "command"
  | "artifact"
  | "endpoint"
  | "ui"
  | "document"
  | "image"
  | "media"
  | "dataset"
  | "manual";

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

/**
 * Routes a criterion to the verification capability that can actually decide it.
 *
 * Document, image, media, and dataset criteria are automated because the worker
 * can inspect those formats directly. Only genuinely human judgments stay
 * manual.
 */
export function parseCriterionChecks(criteria: Array<{ id: string; text: string }>): CriterionCheck[] {
  return criteria.map(({ id: criterionId, text }) => {
    // A criterion that is not stated as an observable result is routed to a human, whatever nouns it happens
    // to contain. This is the same test the prover applies (`reflectsCriterion`), and the two must agree:
    // measured 2026-09-30 (BOARD F-077), a leaf's criterion mentioning "command" was routed to `run_check`
    // and could never be proven by any `run_check`, because it named no observable result. The router was
    // asking for evidence the prover would always refuse, which made the criterion unsatisfiable and the
    // leaf unclosable. Routing it to `request_review` turns an impossible automation demand into a gate a
    // person can answer, which is what a judgement criterion is.
    if (!isObservableCriterion(text)) {
      return { criterionId, kind: "manual" as const, instruction: text, automated: false, verifier: "request_review" };
    }
    const lower = text.toLowerCase();
    const kind: CriterionCheckKind = /npm |pytest|cargo test|go test|run_check|command|script/.test(lower)
      ? "command"
      : /endpoint|api|url|http/.test(lower)
        ? "endpoint"
        : /\.pdf\b|docx|document contains|document states|report states/.test(lower)
          ? "document"
          : /\.png\b|\.jpe?g\b|screenshot|image (?:renders|shows|is not blank)|visual/.test(lower)
            ? "image"
            // The UI signal deliberately does not include a bare `form`. Measured 2026-09-30 (BOARD F-077):
            // a criterion reading *"…contains the invocation forms and both exit codes"* was routed to UI
            // verification because of the word "forms", so a document criterion was handed to a verifier that
            // would never observe it and the criterion stayed `missing` however good the evidence was. A
            // document's invocation forms are not a screen.
            : /\bui\b|screen|page|navigate|click|render|browser|workflow/.test(lower)
              ? "ui"
                : /wav|mp3|\.mp4\b|audio|video|duration|codec|waveform/.test(lower)
                ? "media"
                : /dataset|\.csv\b|json rows|row count|schema|column|invariant|dataset row/.test(lower)
                  ? "dataset"
                  : /file exists|document exists|artifact|\.md\b/.test(lower)
                    ? "artifact"
                    : "manual";
    const verifier = {
      command: "run_check",
      artifact: "inspect_artifact",
      endpoint: "request_endpoint",
      ui: "inspect_ui",
      document: "inspect_document",
      image: "inspect_image",
      media: "inspect_media",
      dataset: "query_dataset",
      manual: "request_review",
    }[kind];
    return {
      criterionId,
      kind,
      instruction: text,
      automated: kind !== "manual" && kind !== "endpoint" ? true : kind === "endpoint",
      verifier,
    };
  });
}
