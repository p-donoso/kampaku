import { afterEach, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "../helpers/test-context.js";
import { createProject } from "../../src/application/projects.js";
import { evaluateCriterionEvidenceGate } from "../../src/application/pm/done-honesty.js";
import { manualCriteriaAwaitingDecision } from "../../src/application/pm/manual-evidence-gate.js";
import {
  completionRecordFromJournal,
  isReportQuoteCriterion,
  reportQuoteObservations,
} from "../../src/application/pm/report-quote.js";
import { parseCriterionChecks } from "../../src/application/pm/criterion-checks.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

/**
 * **A criterion about the leaf's own report is decided by reading the report against the job's record.**
 *
 * Measured across suite 19's scenario L, runs `s19r24`–`s19r28`: every leaf carried one acceptance criterion of
 * the shape *"the completion report quotes the TAP summary lines and exit code"*. The router sent it to
 * `request_review` — no worker tool reads a journal entry — so it became one required question per leaf, on every
 * run, and the track closed `blocked` with its substance green while the operator did what the platform could have
 * done: opened the report and compared it with the check output.
 *
 * The line these cases draw: the platform compares a **quote** with the record it came from, and stops there. A
 * report that quotes a line the job never recorded, or an exit status the job's own outcome contradicts, proves
 * nothing and stays a human gate. A criterion that asks for judgement about the report is not recognised at all.
 */
describe("a report quote is an observation (suite 19 / scenario L)", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  function seed(criteria: string[]) {
    const ctx = createTestContext("kampaku-report-quote-");
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
      title: "Implement summarizeOrder and its tests",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: lead.id,
      acceptanceCriteria: criteria,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return { ctx, project, lead, workItem: ctx.pmStore.getWorkItem("item-1") as WorkItemRecord };
  }

  /** What the job's own check printed, as its evidence carries it. */
  const RECORDED_OUTPUT = [
    "TAP version 13",
    "ok 1 - summarizeOrder totals the rows",
    "ok 2 - summarizeOrder keeps the status",
  ].join("\n");

  function recordJob(params: {
    ctx: TestContext;
    projectId: string;
    workItemId: string;
    checkPassed?: boolean;
  }) {
    params.ctx.journalStore.append({
      projectId: params.projectId,
      workItemId: params.workItemId,
      kind: "completion_report",
      title: "Completed: Implement summarizeOrder and its tests",
      body: "Job succeeded.",
      refType: "job",
      refId: "job-1",
      occurredAt: new Date().toISOString(),
      metadata: {
        jobStatus: "succeeded",
        output: {
          checkResults: { test: params.checkPassed ?? true },
          filesChanged: ["packages/orders/src/summary.js"],
          evidence: [
            {
              subjectType: "behavior",
              format: "code",
              verificationMethod: "command",
              subject: "test",
              passed: params.checkPassed ?? true,
              verified: true,
              reference: "npm test --workspaces",
              observedAt: new Date().toISOString(),
              criterionId: "check:test",
              sourceTool: "run_check",
              output: RECORDED_OUTPUT,
            },
          ],
        },
      },
    });
  }

  function writeReport(params: { ctx: TestContext; projectId: string; workItemId: string; body: string }) {
    params.ctx.journalStore.append({
      projectId: params.projectId,
      workItemId: params.workItemId,
      kind: "completion_report",
      title: "Report: Implement summarizeOrder and its tests",
      body: params.body,
      refType: "work_item",
      refId: params.workItemId,
      occurredAt: new Date().toISOString(),
    });
  }

  const QUOTE_CRITERION = "The completion report quotes the TAP summary lines and the exit code verbatim.";
  const EXIT_CRITERION = "The completion report quotes the TAP summary lines and states exit code 0.";
  const JUDGEMENT_CRITERION = "The completion report explains why the totals are in integer cents.";

  const withRecordedLine =
    "Ran the workspace tests; the summary lines the runner printed are:\n\n"
    + "ok 1 - summarizeOrder totals the rows\nok 2 - summarizeOrder keeps the status";

  it("recognises a claim about the report's quotes and not a judgement about it", () => {
    expect(isReportQuoteCriterion(QUOTE_CRITERION)).toBe(true);
    expect(isReportQuoteCriterion(EXIT_CRITERION)).toBe(true);
    expect(isReportQuoteCriterion(JUDGEMENT_CRITERION)).toBe(false);
    expect(isReportQuoteCriterion("`npm test` exits 0.")).toBe(false);

    // The router is unchanged and still sends the criterion to a human: this module decides what the platform can
    // prove, not what the plan asks for.
    expect(parseCriterionChecks([{ id: "ac-1", text: QUOTE_CRITERION }])[0].kind).toBe("manual");
    expect(manualCriteriaAwaitingDecision(seed([QUOTE_CRITERION]).workItem, context!.journalStore)).toEqual([
      { criterionId: "ac-1", text: QUOTE_CRITERION },
    ]);
  });

  it("closes the criterion the report and the record agree about, without asking", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    writeReport({ ctx, projectId: project.id, workItemId: workItem.id, body: withRecordedLine });
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    const observations = reportQuoteObservations(
      [{ id: "ac-1", text: QUOTE_CRITERION }],
      completionRecordFromJournal(ctx.journalStore, workItem.id),
    );
    expect(observations.map((observation) => observation.criterionId)).toEqual(["ac-1"]);
    expect(observations[0].output).toContain("ok 1 - summarizeOrder totals the rows");

    // Both gates read the same list: closure counts it, and no question is raised for it.
    const gate = evaluateCriterionEvidenceGate(workItem, {}, { journalStore: ctx.journalStore });
    expect(gate.block).toBe(false);
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore)).toEqual([]);
  });

  it("leaves the criterion a human gate when the report quotes nothing the job recorded", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    writeReport({
      ctx,
      projectId: project.id,
      workItemId: workItem.id,
      body: "Ran the workspace tests. All the orders tests pass and the suite is green.",
    });
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: QUOTE_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
    ).toEqual([]);
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore).map((c) => c.criterionId)).toEqual(["ac-1"]);

    // A job that handed in its own records is refused for the criterion the report does not prove. (A job that
    // handed in nothing is the legacy check-result path, which is a different reading and not this module's.)
    const gate = evaluateCriterionEvidenceGate(
      workItem,
      {
        evidence: [
          {
            subjectType: "behavior",
            format: "code",
            verificationMethod: "command",
            subject: "test",
            passed: true,
            verified: true,
            reference: "npm test --workspaces",
            observedAt: new Date().toISOString(),
            sourceTool: "run_check",
            output: RECORDED_OUTPUT,
          },
        ],
      },
      { journalStore: ctx.journalStore },
    );
    expect(gate).toMatchObject({ block: true, code: "criteria_without_evidence", missing: ["ac-1"] });
  });

  it("refuses a report quoting output the job never produced", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    // Plausible, and nowhere in the job's record: a report cannot prove itself by writing a runner's words.
    writeReport({
      ctx,
      projectId: project.id,
      workItemId: workItem.id,
      body: "Ran the workspace tests; the runner printed:\n\nok 3 - summarizeOrder totals a single row\n# pass 8",
    });
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: QUOTE_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
    ).toEqual([]);
  });

  it("refuses a report whose exit status contradicts the job's own outcome", () => {
    const { ctx, project, workItem } = seed([EXIT_CRITERION]);
    writeReport({
      ctx,
      projectId: project.id,
      workItemId: workItem.id,
      body: `${withRecordedLine}\n\nexit code 0`,
    });
    // The record says the check failed: an `exit code 0` in the report is contradicted by the platform's evidence.
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id, checkPassed: false });

    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: EXIT_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
    ).toEqual([]);
  });

  it("is not proven from the platform's own generated completion entry", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    // Only the platform's own entry exists — the leaf wrote no report of its own.
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    expect(completionRecordFromJournal(ctx.journalStore, workItem.id)).toBeUndefined();
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore).map((c) => c.criterionId)).toEqual(["ac-1"]);
  });
});
