import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGoalWithPlan } from "../../src/planner/create-goal.js";
import { createProject } from "../../src/application/projects.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * **A job's obligation is recorded with the text it was read from.**
 *
 * Measured across suite 19's runs `s19r29`–`s19r33`, every one of which ended in a store archaeology: Core reads a
 * leaf's prose and criteria into `requiredChecks`, `requiresDeliverables`, `readOnly`, `expectsFailingCheck` and
 * `frozenPaths`, and sent only the answers. So *"this job is read-only, and the only file permitted for the fix is
 * src/ledger/totals.py"* could not be traced to the sentence that decided it without re-reading the plan by hand
 * (BOARD F-163), and a fix could not be shown to be the right one.
 *
 * What this locks: the dispatch carries the leaf's own words, the answers, and the branch that decided each one — so a
 * refusal is re-derivable from the record.
 */
describe("the obligation a job carries (F-163)", () => {
  let context: TestContext | undefined;
  let checkout: string | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
    if (checkout) rmSync(checkout, { recursive: true, force: true });
    checkout = undefined;
  });

  it("records the prose, the criteria and which branch decided each answer", async () => {
    context = createTestContext("kampaku-obligation-source-");
    const ctx = context;
    checkout = mkdtempSync(join(tmpdir(), "kampaku-obligation-checkout-"));
    writeFileSync(join(checkout, "run-tests.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    mkdirSync(join(checkout, "checks"), { recursive: true });
    writeFileSync(join(checkout, "checks", "test_parse.py"), "assert True\n");

    const project = createProject(ctx.store, { slug: "legacy-ledger", name: "legacy-ledger", status: "active" });
    const criteria = [
      "The completion report quotes `./run-tests.sh` and states exit code 0.",
      "Every other file in the checkout was left untouched by this leaf.",
    ];

    const result = await createGoalWithPlan(ctx.store, ctx.config, {
      projectId: project.id,
      objective: "Repair the parser.",
      repositoryRole: "core",
      projectContext: {
        projectId: project.id,
        projectSlug: "legacy-ledger",
        projectName: "legacy-ledger",
        repositories: project.repositories,
        repositoryRole: "core",
        repositoryPath: checkout,
        workspaceDir: "eval-legacy-ledger",
        isExternal: true,
        stackHints: [],
      },
      plannedTask: {
        title: "Skip comment lines in parse_lines",
        prompt: "Add a comment-skip guard inside parse_lines and verify with the repository's check.",
        repositoryRole: "core",
        acceptanceCriteria: criteria,
      },
    });

    const input = ctx.store.getJob(result.jobId)?.input as
      | {
          requiredChecks?: string[];
          requiresDeliverables?: boolean;
          readOnly?: boolean;
          obligationSource?: {
            prose?: string;
            criteria?: string[];
            decidedBy?: Record<string, string>;
          };
        }
      | undefined;

    // The answers, which the job already carried.
    expect(input?.requiredChecks).toEqual(["test"]);
    expect(input?.requiresDeliverables).toBe(true);
    expect(input?.readOnly).toBeFalsy();

    // The text they were read from — verbatim, so a refusal can be explained without the plan.
    expect(input?.obligationSource?.prose).toContain("comment-skip guard");
    expect(input?.obligationSource?.criteria).toEqual(criteria);

    // And the branch that decided each answer, so "why is this job writable" has a sentence for an answer.
    const decidedBy = input?.obligationSource?.decidedBy ?? {};
    expect(Object.keys(decidedBy).sort()).toEqual(
      ["expectsFailingCheck", "frozenPaths", "readOnly", "requiredChecks", "requiresDeliverables"],
    );
    expect(decidedBy.requiresDeliverables).toContain("asks for a change");
    expect(decidedBy.readOnly).toContain("nothing in the leaf's text bans writing");
    expect(decidedBy.requiredChecks).toContain("members named by the leaf");
  }, 20_000);
});
