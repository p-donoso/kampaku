import { afterEach, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "../helpers/test-context.js";
import { createProject } from "../../src/application/projects.js";
import {
  evaluateEvidenceCoverage,
  keyEvidenceToCriteria,
  reflectsCriterion,
  type CriterionEvidenceRecord,
} from "../../src/application/pm/evidence-review.js";
import {
  completionRecordFromJournal,
  isReportQuoteCriterion,
  reportQuoteObservations,
} from "../../src/application/pm/report-quote.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

/**
 * **A criterion about what the report printed is not proven by the check it is about.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r30`. Leaf `49d54999` carried six criteria, four of them about the *report*
 * — *"the completion report quotes `git status --porcelain`, `git rev-parse --abbrev-ref HEAD` and `git log
 * --oneline`"*, *"the quoted `git status --porcelain` is empty"* — and the leaf closed `done` with the `test` check's
 * record as the evidence for all of them. The record's reference is `./run-tests.sh`, the criterion quotes
 * `./run-tests.sh`, and `reflectsCriterion`'s wording test read that as related. The report itself never mentions
 * `git status`: the platform accepted a claim about what the leaf *wrote* on the strength of what the leaf *ran*.
 *
 * The line these cases draw: such a criterion is answered by reading the report (`report-quote.ts`), and a job may
 * not hand in the reading itself — the record has to be the platform's, or the criterion stays open.
 */
describe("a report quote is proven by reading the report (suite 19 / s19r30)", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  const CRITERION =
    "The completion report quotes `git status --porcelain`, `git rev-parse --abbrev-ref HEAD` and `git log --oneline`.";

  /** The record the `test` check leaves: it ran `./run-tests.sh`, and says nothing about `git status`. */
  const CHECK_RECORD: CriterionEvidenceRecord = {
    subjectType: "behavior",
    format: "code",
    verificationMethod: "command",
    subject: "test",
    passed: true,
    verified: true,
    reference: "./run-tests.sh",
    observedAt: new Date().toISOString(),
    sourceTool: "run_check",
    output: "checks/test_parse.py ... FAILED\nchecks/test_totals.py ... FAILED",
  };

  it("does not read a noun as a claim: the report *path* is not the report", () => {
    // Another eval fixture's criterion, which my own first reading of this rule broke: *"make check exits 0 and the
    // output lists the report path"* is a command criterion, and the check record that proves it must stand.
    expect(isReportQuoteCriterion("make check exits 0 and the output lists the report path")).toBe(false);
    expect(isReportQuoteCriterion("The completion report quotes the TAP summary lines.")).toBe(true);
    expect(isReportQuoteCriterion("The diagnosis report quotes the verbatim output of `./run-tests.sh`.")).toBe(true);
  });

  it("refuses a check record as proof of what the report quotes", () => {
    expect(reflectsCriterion(CRITERION, CHECK_RECORD)).toMatchObject({ proves: false });

    // The platform's own reading of the report proves it — the record `report-quote.ts` builds, and only that shape.
    expect(
      reflectsCriterion(CRITERION, {
        subjectType: "artifact",
        format: "document",
        verificationMethod: "file-inspection",
        subject: "completion report",
        passed: true,
        verified: true,
        sourceTool: "inspect_document",
        reference: "report-1",
        observedAt: new Date().toISOString(),
        platformRead: true,
      }),
    ).toMatchObject({ proves: true });
  });

  it("leaves the criterion open when only the check's record exists", () => {
    const ctx = createTestContext("kampaku-report-read-");
    context = ctx;
    const project = createProject(ctx.store, { slug: "cli", name: "CLI", status: "active" });
    const lead = ctx.agentStore.createSubAgent({
      slug: "cli-lead",
      name: "CLI lead",
      parentId: ctx.agentStore.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Own the CLI work order",
      systemPrompt: "Own the CLI work order",
    });
    const now = new Date().toISOString();
    ctx.pmStore.createWorkItem({
      id: "item-1",
      projectId: project.id,
      title: "Capture baseline",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: lead.id,
      acceptanceCriteria: [CRITERION],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    const workItem = ctx.pmStore.getWorkItem("item-1") as WorkItemRecord;

    const criteria = [{ id: "ac-1", text: CRITERION }];

    // The job's record cannot be keyed onto the criterion at all, so the criterion is unproven (not "covered by the
    // check", which is what run `s19r30` reported).
    const keyed = evaluateEvidenceCoverage(workItem, keyEvidenceToCriteria(criteria, [CHECK_RECORD]), criteria);
    expect(keyed).toMatchObject({ ok: false, covered: [], missing: ["ac-1"] });

    // When a producer names the criterion itself, the refusal is explicit and says why.
    const named = evaluateEvidenceCoverage(
      workItem,
      [{ ...CHECK_RECORD, criterionId: "ac-1" }],
      criteria,
    );
    expect(named).toMatchObject({ ok: false, covered: [], insufficient: ["ac-1"] });
    expect(named.criteria[0].reasons.join(" ")).toContain("proven by reading the report");

    // The report does not quote `git status`, so the platform's own reading proves nothing either.
    ctx.journalStore.append({
      projectId: project.id,
      workItemId: workItem.id,
      kind: "completion_report",
      title: "Completed: Capture baseline",
      body: "Status: succeeded\nRan ./run-tests.sh; both checks FAILED.",
      refType: "job",
      refId: "job-1",
      metadata: { jobStatus: "succeeded", output: { checkResults: { test: false } } },
    });
    expect(
      reportQuoteObservations(criteria, completionRecordFromJournal(ctx.journalStore, workItem.id)),
    ).toEqual([]);
  });
});
