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

  it("routes a criterion to the tool that can actually decide it, and to a person when none can", () => {
    // Measured 2026-09-30 on suite 08's fifth run (BOARD F-083), on the leaf's own criteria. This is the
    // distinction the router exists to make, in three parts:
    //
    //   * a criterion naming a check the **repository declares** is decided by that check — `run_check`
    //     resolves the name against the checkout;
    //   * a criterion asking whether a **file exists** is decided by inspecting it — `verify_file` is the
    //     tool that answers, and `test -f` is not a check any repository declares;
    //   * a criterion quoting a **command the executor cannot run** stays a person's decision. The executor
    //     holds no general command runner: `run_check` takes a check name and refuses anything else. Routing
    //     the third case to `run_check` asked for evidence no caller could produce, so the criterion was
    //     unsatisfiable and the leaf could never close — and no gate was raised for it either, because a
    //     command criterion is not a manual one.
    const checks = parseCriterionChecks([
      { id: "ac-2", text: "`make check` exits 0 and lists the new cases" },
      { id: "ac-6", text: "File-exists check passes: `test -f src/textstats/cli.py && test -f tests/test_cli.py`" },
      { id: "ac-3", text: "`printf 'one two one' | PYTHONPATH=src python3 -m textstats` prints two lines and exit code 0" },
      { id: "ac-4", text: '`grep -c "project.scripts" pyproject.toml` returns 0 (no entry point added)' },
    ]);
    expect(checks.map((check) => check.kind)).toEqual(["command", "artifact", "manual", "manual"]);
    expect(checks.map((check) => check.verifier)).toEqual([
      "run_check",
      "inspect_artifact",
      "request_review",
      "request_review",
    ]);

    // And prose *about* a command is a judgement too: it names a command, and it is not stated as a result a
    // tool can witness.
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

  it("decides a path-existence criterion by its verb, never by the words in the path (F-087)", () => {
    // Measured 2026-10-01 on suite 08's run `s08r8`. The keyword chain reads the whole criterion, so
    // `workflows` inside `.github/workflows/ci.yml` claimed the UI arm and the criterion was handed to
    // `inspect_ui` — `automated: true`, so no gate was raised, and the leaf that owned it was refused by the
    // closure gate with nothing asked. `docs/ci-workflow.md` and `src/render/page.tsx` took the same branch
    // through `workflow`, `page` and `render`. The splitter writes the CI criterion itself for any slice that
    // names the workflow file, so this is not a hypothetical spelling.
    const checks = parseCriterionChecks([
      { id: "ac-ci", text: "file exists at .github/workflows/ci.yml" },
      { id: "ac-doc", text: "file exists at docs/ci-workflow.md" },
      { id: "ac-page", text: "file exists at src/render/page.tsx" },
      { id: "ac-testf", text: "File-exists check passes: `test -f src/textstats/cli.py`" },
    ]);
    expect(checks.map((check) => check.kind)).toEqual(["artifact", "artifact", "artifact", "artifact"]);
    expect(checks.map((check) => check.verifier)).toEqual([
      "inspect_artifact",
      "inspect_artifact",
      "inspect_artifact",
      "inspect_artifact",
    ]);

    // The widening did not swallow the readers that exist for a reason, and it did not make a screen into a file.
    const controls = parseCriterionChecks([
      { id: "ac-ui", text: "The page renders the greeting form and clicking submit navigates to the result" },
      { id: "ac-pdf", text: "Document exists at docs/brief.pdf" },
    ]);
    expect(controls.map((check) => check.verifier)).toEqual(["inspect_ui", "inspect_document"]);
  });
});
