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

  it("routes a criterion no tool can prove to a human, whatever nouns it contains", () => {
    // Measured 2026-09-30 on suite 08's run (BOARD F-077): this leaf criterion mentions "command", so the
    // router sent it to `run_check` — and `reflectsCriterion` refuses any tool observation for it, because
    // it names no observable result. The router was demanding evidence the prover would always reject, so
    // the criterion was unsatisfiable and the leaf could never close. Two gates must not disagree about
    // which criteria a tool can decide; the one vocabulary is `criterion-observability.ts`.
    const [check] = parseCriterionChecks([
      {
        id: "ac-3",
        text:
          "Every command quoted in the document was executed verbatim from the checkout and behaved exactly as written; no command is named that this checkout cannot run",
      },
    ]);
    expect(check.kind).toBe("manual");
    expect(check.verifier).toBe("request_review");
    expect(check.automated).toBe(false);

    // And the widening did not swallow real observability: a criterion about a result is still a tool's job.
    const [exists] = parseCriterionChecks([{ id: "ac-1", text: "Document exists at docs/brief.pdf" }]);
    expect(exists.kind).toBe("document");
    expect(exists.automated).toBe(true);
  });

  it("decides a criterion that quotes a command, wherever in the sentence the command sits", () => {
    // Measured 2026-09-30 on suite 08's fifth run (BOARD F-083): the leaf's own criteria —
    //
    //   ac-3: `printf 'one two one\n' | PYTHONPATH=src python3 -m textstats` prints exactly two lines …
    //   ac-4: `grep -c "project.scripts" pyproject.toml` returns 0 (no entry point added)
    //   ac-6: File-exists check passes: `test -f src/textstats/cli.py && …`
    //
    // were each routed to a **human**, because the command inside them is neither the first token of a line
    // nor the token that follows a backtick — it follows a pipe, an env assignment, or a `&&`. The operator
    // was then asked to decide, by eye, things the job could have run and quoted: the questions are real
    // gates, but asking them about a command is the product offloading a check onto a person.
    const checks = parseCriterionChecks([
      { id: "ac-3", text: "`printf 'one two one' | PYTHONPATH=src python3 -m textstats` prints two lines and exit code 0" },
      { id: "ac-4", text: '`grep -c "project.scripts" pyproject.toml` returns 0 (no entry point added)' },
      { id: "ac-6", text: "File-exists check passes: `test -f src/textstats/cli.py && test -f tests/test_cli.py`" },
    ]);
    expect(checks.map((check) => check.kind)).toEqual(["command", "command", "command"]);
    expect(checks.map((check) => check.verifier)).toEqual(["run_check", "run_check", "run_check"]);

    // And prose *about* a command is still a judgement: this one names a command, is not stated as a result
    // a tool can witness, and must not be answered by running the command somewhere else.
    const [prose] = parseCriterionChecks([
      { id: "ac-8", text: "README.md documents make check as the way to run the tests" },
    ]);
    expect(prose.kind).toBe("manual");
    expect(prose.verifier).toBe("request_review");
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
