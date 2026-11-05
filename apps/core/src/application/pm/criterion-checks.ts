import { isObservableCriterion } from "./criterion-observability.js";
import { inferRequiredCheckScripts } from "./work-item-checks.js";

/**
 * Whether a criterion **is** a command to run: the quoted, program-plus-arguments span that leads it.
 *
 * The lead position is deliberate and is the difference between two real criteria, measured a day apart:
 *
 * - `"`PYTHONPATH=src python3 -m textstats README.md` exits 0 and every stdout line matches …"` — the command is
 *   the subject, and no inspection of a file can witness what it prints (suite 11, run `s11r1`, BOARD F-123);
 * - `"Every command shown in README.md runs verbatim from the repository root; `PYTHONPATH=src python3 -m
 *   textstats --help` lists exactly the flags the README names"` — the subject is the **document**, and the
 *   document's own reader is what decides it. Reading this as a command criterion refused a document leaf its
 *   evidence and broke the suite-08 lock that already asserted this shape (`eval-hands-off-execution`).
 *
 * So the rule is the narrow one: a command in the leading position claims behaviour; a command quoted inside a
 * sentence about an artifact belongs to that artifact.
 */
export function isBehaviorCriterion(criterionText: string): boolean {
  const text = criterionText.trim();
  if (!text) return false;
  const lead = text.match(/^`([^`]+)`/);
  if (!lead) return false;
  const span = lead[1].trim();
  return /\s/.test(span) && /^[\w./=:-]+\s+\S/.test(span);
}

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
 * A criterion that asks for proof that a path exists, which the executor can witness by inspecting it.
 *
 * `test -f`, `test -e` and `test -d` are what a plan writes when it wants that; the check-names branch above
 * does not claim them, because `test` is not a check a repository declares. The tool that answers is
 * `verify_file`, which is why this is an artifact criterion rather than a command one.
 *
 * **The verb decides this, not the words inside the path** (BOARD F-087). The keyword chain below reads the
 * whole criterion text, so a path-existence criterion naming `.github/workflows/ci.yml` was claimed by the
 * `workflow` arm and handed to `inspect_ui`, and `docs/ci-workflow.md` and `src/render/page.tsx` took the same
 * wrong branch through `page` and `render`. `automated: true` then meant no gate was raised, so the leaf that
 * owned the criterion was refused by the closure gate with nothing asked — silent, and therefore worse than a
 * wrong verifier. Measured 2026-10-01 on suite 08's run `s08r8`, reproduced here as the pattern's own unit
 * test. An existence assertion is a property of the sentence's verb (`exists at`, `file exists`, `test -f`),
 * never of how the path happens to be spelled.
 */
const PATH_EXISTENCE_CHECK =
  /\btest -[fed]\b|\bexists at\b|\b(?:file|path|artifact|deliverable|document|directory|readme|script)\s+exists\b/i;

/**
 * Formats whose existence is decided by the reader for that format, not by a plain path check.
 *
 * A criterion about `docs/brief.pdf` or `shot.png` is an artifact too, but the tool that answers it is the
 * document or image reader — it is the format that makes the difference, and routing it to the generic
 * artifact verifier would lose that. Kept here so the path-existence arm above does not swallow them.
 */
const FORMATTED_ARTIFACT_CHECK = /\.pdf\b|docx|\.png\b|\.jpe?g\b|wav|mp3|\.mp4\b/i;

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

    // A criterion that asks whether a file exists is decided by inspecting it. `verify_file` is the tool that
    // answers, and it keys its observation to `artifact:<path>`, which `keyEvidenceToCriteria` maps onto a
    // criterion routed here.
    if (PATH_EXISTENCE_CHECK.test(text) && !FORMATTED_ARTIFACT_CHECK.test(text)) {
      return { criterionId, kind: "artifact" as const, instruction: text, automated: true, verifier: "inspect_artifact" };
    }

    // **A behaviour criterion is never handed to the artifact verifier.** Reading a file answers *what is
    // there*; a criterion that quotes a command answers *what it does when run*, and no inspection of any file
    // can witness that — the shape suite 11 calls *structural validity accepted as proof*. Measured
    // 2026-10-21 on run `s11r1`: leaf `9bcc2eb2`'s `ac-2` (*"`PYTHONPATH=src python3 -m textstats README.md`
    // exits 0 and every stdout line matches …"*) was routed to `inspect_artifact` because `README.md` appears
    // inside the command it quotes, and was then reported **covered** by `artifact:src/textstats/cli.py`
    // (BOARD F-123). It is `manual` here because the worker holds no general command runner; the operator's
    // `kampaku projects verify` runs the quoted command and records its output as the evidence.
    if (isBehaviorCriterion(text)) {
      return { criterionId, kind: "manual" as const, instruction: text, automated: false, verifier: "request_review" };
    }

    // A criterion that quotes a command which is **not** one of the repository's declared checks stays a
    // human decision, and that is the measured lesson of two runs (BOARD F-083).
    //
    // The executor runs the repository's own checks and inspects files; it holds **no general command
    // runner**. So a criterion reading
    //
    //     `printf 'one two one\n' | PYTHONPATH=src python3 -m textstats` prints `total=3 unique=2`, exit 0
    //
    // cannot be satisfied by any `run_check` — `run_check` takes a *check name* the repository declares
    // (`test`, `lint`, …) and refuses anything else — and there is no other tool that could run it. Routing it
    // to `run_check` asked for evidence that no caller could produce, which made the criterion unsatisfiable
    // and the leaf unclosable, with no gate raised for it either: run five's leaf was refused for `ac-3`,
    // `ac-4` and `ac-5`, reviews were opened for two of them, and `ac-3` had no review and no question at all.
    // The honest routing is `request_review`: the emperor can run the command, and the decision is the
    // evidence.

    // The keyword chain below deliberately has **no** `command` arm.
    //
    // `command` is not a property of a criterion's wording, it is a property of the repository: `run_check`
    // takes the name of a check the checkout declares and refuses anything else, so the only vocabulary that
    // may route to it is the one the runner reads (`inferRequiredCheckScripts`, above). A word list cannot do
    // this job, and two measured runs say why: `/command|script/` routed a criterion mentioning "the
    // invocation forms" to `run_check`, and then routed one about `project.scripts` — a **pyproject key name**
    // — to `run_check` as well, each time asking the executor for evidence it has no way to produce. Every
    // such criterion was unsatisfiable and, because a command criterion is not a manual one, silent: no gate
    // was raised for it either (BOARD F-077, F-083).
    const lower = text.toLowerCase();
    // **The words inside a quoted command are not the criterion's subject.** `ac-2` of suite 11's leaf
    // `9bcc2eb2` read *"`PYTHONPATH=src python3 -m textstats README.md` exits 0 …"* and was routed to the
    // artifact verifier because of the `.md` inside the command it quotes — so a behaviour criterion was handed
    // to a verifier that can only look at a file, and it was then "covered" by that file's existence. Measured
    // 2026-10-21 on run `s11r1` (BOARD F-123). The quoted span is the check; the prose around it is the claim.
    const prose = lower.replace(/`[^`]+`/g, " ");
    const kind: CriterionCheckKind = /endpoint|api|url|http/.test(lower)
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
                  : /file exists|document exists|artifact|\.md\b/.test(prose)
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
