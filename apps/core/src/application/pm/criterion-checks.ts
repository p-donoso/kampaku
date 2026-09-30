import { isObservableCriterion } from "./criterion-observability.js";
import { inferRequiredCheckScripts } from "./work-item-checks.js";

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
/**
 * The shape of a command a shell can run and whose output a job can quote.
 *
 * Deliberately narrow, and deliberately not a list of nouns: a command only counts when it is quoted in
 * backticks or begins a line (optionally as a bullet), so that prose *about* commands — "the document
 * contains the invocation forms", "the plan must make sense" — is not read as one. `test -f` and `test -e`
 * are here because they are what a plan writes when it wants proof that a file exists, and `make <target>`
 * because a Makefile's targets are the repository's own declared checks.
 */
const RUNNABLE_COMMAND_SHAPE =
  /(?:(?:^|[\n\r])[ \t]*(?:[-*+]|\d+\.)?[ \t]*|`[ \t]*|[|;&][ \t]*|[A-Z][A-Z0-9_]*=\S+[ \t]+)(?:test\b|make\b|git\b|printf\b|echo\b|ls\b|cat\b|grep\b|sed\b|awk\b|head\b|tail\b|sort\b|cut\b|wc\b|diff\b|python3?\b|node\b|npm\b|npx\b|make\b|pip\b|poetry\b|uv\b|cargo\b|go\b|dotnet\b|mvn\b|gradle\b|bundle\b|pytest\b|mypy\b|ruff\b|java\b|zig\b|docker\b)/im;

function namesRunnableCommand(text: string): boolean {
  return RUNNABLE_COMMAND_SHAPE.test(text);
}

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

    // A criterion that names a check the repository declares is decided by that check — the same reading the
    // execution path already makes, because `inferRequiredCheckScripts` is what decides which checks a job is
    // required to run. Measured 2026-09-30 on suite 08's fourth run (BOARD F-082): a leaf whose four criteria
    // all named `make check`, `make lint` or `test -f …` was classified **manual** by the keyword chain
    // below, because the chain only recognises a command when it reads `npm `, `pytest`, `cargo test`,
    // `go test`, `run_check`, `command` or `script`. The fixture is a Makefile-wrapped Python package, so
    // every one of its criteria looked like a human judgement — and a criterion no tool can decide cannot
    // be closed by any job, however honest, because nothing in the product produces a manual review.
    // Consulting the check names instead of a fixed vocabulary means the router agrees with the runner.
    if (inferRequiredCheckScripts(text).length > 0) {
      return { criterionId, kind: "command" as const, instruction: text, automated: true, verifier: "run_check" };
    }

    // The same is true of a criterion that quotes a command rather than a check name: `test -f a && test -f
    // b`, `python3 -m textstats --help`, `git diff --quiet`. These are shell commands a job can run and
    // quote, and they were classified `manual` for the same reason — no word in them belonged to the
    // vocabulary below. A criterion that quotes a runnable command is a command criterion.
    if (namesRunnableCommand(text)) {
      return { criterionId, kind: "command" as const, instruction: text, automated: true, verifier: "run_check" };
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
