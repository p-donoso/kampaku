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
 * Measured across suite 19's scenario L, runs `s19r24`–`s19r29`: every leaf carried one acceptance criterion of
 * the shape *"the completion report quotes the exact commands, exit status per check, and failing output"*. The
 * router sends it to `request_review` — no worker tool reads a journal entry — so it became one required question
 * per leaf, on every run, and the track closed `blocked` with its substance green while the operator did what the
 * platform could have done: opened the report and compared it with the check output.
 *
 * The line these cases draw: the platform compares a **quote** with the record it came from, and stops there. A
 * report that does not name the command the job ran, that quotes a line the job never recorded, or whose exit
 * status the job's own outcome contradicts, proves nothing and stays a human gate. A criterion that asks for
 * judgement about the report is not recognised at all.
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
      title: "Baseline evidence",
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

  /** What the job's own check printed, as the repository's runner printed it. */
  const RECORDED_OUTPUT = [
    "checks/test_parse.py ... FAILED",
    "checks/test_totals.py ... FAILED",
    "",
    "AssertionError: an empty book totals None, not 0",
  ].join("\n");

  /**
   * A job record in the shape the worker really leaves: `run_check` answers with JSON, so the excerpt a job's
   * evidence carries is a **document about** the output, with the output `\n`-escaped inside it. Measured on run
   * `s19r29` — the first version of this module read that as one long line and found nothing.
   */
  function recordJob(params: {
    ctx: TestContext;
    projectId: string;
    workItemId: string;
    checkPassed?: boolean;
    body?: string;
  }) {
    params.ctx.journalStore.append({
      projectId: params.projectId,
      workItemId: params.workItemId,
      kind: "completion_report",
      title: "Completed: Baseline evidence",
      body: params.body ?? "Status: succeeded\nJob: job-1",
      refType: "job",
      refId: "job-1",
      occurredAt: new Date().toISOString(),
      metadata: {
        jobStatus: "succeeded",
        output: {
          summary: "I ran the declared check and read the checkout.",
          checkResults: { test: params.checkPassed ?? false },
          filesChanged: [],
          evidence: [
            {
              subjectType: "behavior",
              format: "code",
              verificationMethod: "command",
              subject: "test",
              passed: params.checkPassed ?? false,
              verified: true,
              reference: "./run-tests.sh",
              observedAt: new Date().toISOString(),
              criterionId: "check:test",
              sourceTool: "run_check",
              output: JSON.stringify({
                ok: params.checkPassed ?? false,
                script: "test",
                command: "./run-tests.sh",
                output: RECORDED_OUTPUT,
              }),
            },
          ],
        },
      },
    });
  }

  /**
   * The leaf's report, as the journal holds it: the platform's own entry, whose body quotes the leaf's summary and
   * detail verbatim (`buildCompletionMessages`). That is the shape run `s19r29` produced, and it was the only entry
   * the leaf ever had.
   */
  function writeReport(params: { ctx: TestContext; projectId: string; workItemId: string; body: string }) {
    params.ctx.journalStore.append({
      projectId: params.projectId,
      workItemId: params.workItemId,
      kind: "completion_report",
      title: "Report: Baseline evidence",
      body: params.body,
      refType: "work_item",
      refId: params.workItemId,
      occurredAt: new Date().toISOString(),
    });
  }

  const QUOTE_CRITERION = "Completion report quotes the exact commands and the failing output";
  const EXIT_CRITERION = "The completion report quotes the failing output and states exit code 0.";
  const JUDGEMENT_CRITERION = "The completion report explains why the totals are in integer cents.";

  const REPORT_QUOTING = [
    "## Check execution",
    "`run_check` with `script: \"test\"` resolved to `./run-tests.sh`.",
    "Verbatim output:",
    "",
    "checks/test_parse.py ... FAILED",
    "checks/test_totals.py ... FAILED",
  ].join("\n");

  it("recognises a claim about the report's quotes and not a judgement about it", () => {
    expect(isReportQuoteCriterion(QUOTE_CRITERION)).toBe(true);
    expect(isReportQuoteCriterion(EXIT_CRITERION)).toBe(true);
    expect(isReportQuoteCriterion(JUDGEMENT_CRITERION)).toBe(false);
    expect(isReportQuoteCriterion("`npm test` exits 0.")).toBe(false);

    // The router is unchanged and still sends the criterion to a human: this module decides what the platform can
    // prove, not what the plan asks for.
    expect(parseCriterionChecks([{ id: "ac-1", text: QUOTE_CRITERION }])[0].kind).toBe("manual");
    const { ctx, workItem } = seed([QUOTE_CRITERION]);
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore)).toEqual([
      { criterionId: "ac-1", text: QUOTE_CRITERION },
    ]);
  });

  it("closes the criterion the report and the record agree about, without asking", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    writeReport({ ctx, projectId: project.id, workItemId: workItem.id, body: REPORT_QUOTING });
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    const observations = reportQuoteObservations(
      [{ id: "ac-1", text: QUOTE_CRITERION }],
      completionRecordFromJournal(ctx.journalStore, workItem.id),
    );
    expect(observations.map((observation) => observation.criterionId)).toEqual(["ac-1"]);
    expect(observations[0].output).toContain("checks/test_parse.py ... FAILED");

    // Both gates read the same list: closure counts it, and no question is raised for it.
    expect(evaluateCriterionEvidenceGate(workItem, {}, { journalStore: ctx.journalStore }).block).toBe(false);
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore)).toEqual([]);
  });

  it("reads a report the job wrote through its result, not just one submitted by hand", () => {
    // Run `s19r29`'s shape: one completion entry, the platform's, quoting the leaf's own summary and detail.
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id, body: REPORT_QUOTING });

    expect(completionRecordFromJournal(ctx.journalStore, workItem.id)?.reportText).toContain("run-tests.sh");
    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: QUOTE_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
    ).toHaveLength(1);
  });

  it("leaves the criterion a human gate when the report quotes nothing the job recorded", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    writeReport({
      ctx,
      projectId: project.id,
      workItemId: workItem.id,
      body: "Ran ./run-tests.sh and both checks fail. The failures are in the parser and in the totals.",
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
            passed: false,
            verified: true,
            reference: "./run-tests.sh",
            observedAt: new Date().toISOString(),
            sourceTool: "run_check",
            output: RECORDED_OUTPUT,
          },
        ],
      },
      { journalStore: ctx.journalStore, evidenceOnly: true },
    );
    expect(gate).toMatchObject({ block: true, code: "criteria_without_evidence", missing: ["ac-1"] });
  });

  it("refuses a report that does not name the command the job ran", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    // The output is quoted verbatim, but the command the record names is nowhere in the report.
    writeReport({
      ctx,
      projectId: project.id,
      workItemId: workItem.id,
      body: "I ran the repository's test check. Verbatim output:\n\n" + RECORDED_OUTPUT,
    });
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: QUOTE_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
    ).toEqual([]);
  });

  it("refuses a report quoting output the job never produced", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    // Plausible, and nowhere in the job's record: a report cannot prove itself by writing a runner's words.
    writeReport({
      ctx,
      projectId: project.id,
      workItemId: workItem.id,
      body: "Ran `./run-tests.sh`:\n\nchecks/test_parse.py ... ok\nchecks/test_totals.py ... ok",
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
      body: `${REPORT_QUOTING}\n\nexit code 0`,
    });
    // The record says the check failed: an `exit code 0` in the report is contradicted by the platform's evidence.
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id, checkPassed: false });

    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: EXIT_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
      // The criterion is about a passing exit status, and the job's own record says the check failed.
    ).toEqual([]);
  });

  it("reads the leaf's own words when the rendered body was cut", () => {
    // Run `s19r30`'s shape: a 6 753-character report, journalled as a 4 096-character body, with the quotes the
    // criteria ask about written past the cut — and kept in full under `output.summary`.
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    // The quotes the criterion asks about are written **past** the cut, which is what run `s19r30` produced.
    const full = "## ac-1\n" + "PADDING ".repeat(900) + "\n\n" + REPORT_QUOTING;
    ctx.journalStore.append({
      projectId: project.id,
      workItemId: workItem.id,
      kind: "completion_report",
      title: "Completed: Baseline evidence",
      body: "Status: succeeded\nJob: job-1\n\n## Summary\n" + full.slice(0, 4_000) + "…",
      refType: "job",
      refId: "job-1",
      occurredAt: new Date().toISOString(),
      metadata: { jobStatus: "succeeded", output: { summary: full, checkResults: { test: false } } },
    });
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    expect(full.length).toBeGreaterThan(4_096);
    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: QUOTE_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
    ).toHaveLength(1);
  });

  it("proves nothing from a generated header alone", () => {
    const { ctx, project, workItem } = seed([QUOTE_CRITERION]);
    // Only the platform's entry exists, and it carries its generated header and no quote of the output.
    recordJob({ ctx, projectId: project.id, workItemId: workItem.id });

    expect(`Job: job-1`).not.toContain("checks/test_parse.py");
    expect(
      reportQuoteObservations(
        [{ id: "ac-1", text: QUOTE_CRITERION }],
        completionRecordFromJournal(ctx.journalStore, workItem.id),
      ),
    ).toEqual([]);
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore).map((c) => c.criterionId)).toEqual(["ac-1"]);
  });
});
