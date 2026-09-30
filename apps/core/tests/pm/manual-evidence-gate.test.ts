import { afterEach, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "../helpers/test-context.js";
import { createProject } from "../../src/application/projects.js";
import { evaluateCriterionEvidenceGate } from "../../src/application/pm/done-honesty.js";
import {
  ACCEPT_OPTION,
  REJECT_OPTION,
  answerAcceptsCriterion,
  manualCriteriaAwaitingDecision,
  manualEvidenceBlockDetail,
  manualEvidenceQuestionId,
  openManualEvidenceGates,
  parseManualEvidenceQuestion,
  resolveManualEvidenceFromAnswer,
} from "../../src/application/pm/manual-evidence-gate.js";
import { summarizeManualReviews } from "../../src/application/pm/evidence-review.js";
import { parseCriterionChecks } from "../../src/application/pm/criterion-checks.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

/**
 * The manual-evidence round trip: a criterion no tool can decide has to become a decision somebody makes.
 *
 * Measured 2026-09-30 on suite 08's fourth run (BOARD F-082). The plan routed the leaf's fourth criterion to
 * `request_review`, the closure gate refused the item for it (*"Acceptance criteria without evidence: ac-4."*),
 * the job's evidence was otherwise complete — and **nothing in the product asked a person**. The review model
 * existed end to end and had no producer: `requestManualEvidenceReview` and `resolveManualEvidenceReview`
 * were called by nothing but their own tests, so the leaf could never close and auto-execution ran it again.
 *
 * These cases lock the four links: the gate is raised only for criteria no tool can decide, the decision is
 * recorded against the criterion, an acceptance closes the leaf, and a producer cannot certify its own
 * criterion as human-decided.
 */

describe("manual evidence gate", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  function seed(criteria: string[]) {
    const ctx = createTestContext("kampaku-manual-evidence-");
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
      title: "Statistics module",
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

  const DECIDABLE = "`make check` exits 0 and its verbose output lists the new cases.";
  const JUDGEMENT = "A person who knows the product agrees the numbers look right.";

  it("raises a decision only for the criteria no tool can decide", () => {
    const { ctx, workItem } = seed([DECIDABLE, JUDGEMENT]);
    expect(parseCriterionChecks([
      { id: "ac-1", text: DECIDABLE },
      { id: "ac-2", text: JUDGEMENT },
    ]).map((check) => check.kind)).toEqual(["command", "manual"]);

    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore)).toEqual([
      { criterionId: "ac-2", text: JUDGEMENT },
    ]);
  });

  it("records a review and asks the emperor, once per criterion", () => {
    const { ctx, workItem } = seed([DECIDABLE, JUDGEMENT]);
    const opened = openManualEvidenceGates({
      workItem,
      journalStore: ctx.journalStore,
      questionStore: ctx.questionStore,
      askedByAgentId: workItem.assigneeAgentId as string,
      reason: "Acceptance criteria without evidence: ac-2.",
    });

    expect(opened.criteria).toEqual(["ac-2"]);
    expect(opened.questionsCreated).toBe(1);
    const pending = summarizeManualReviews(ctx.journalStore, workItem.id).pending;
    expect(pending.map((review) => review.criterionId)).toEqual(["ac-2"]);

    // The gate is a real question: required, addressed to the emperor, and quoting the criterion.
    const question = opened.questions[0];
    expect(question.status).toBe("pending");
    expect(question.workItemId).toBe(workItem.id);
    expect(question.question).toContain(manualEvidenceQuestionId(workItem.id, "ac-2"));
    expect(question.question).toContain(ACCEPT_OPTION);
    expect(question.question).toContain(REJECT_OPTION);
    expect(question.context).toContain(JUDGEMENT);

    // A retried job must not raise a second decision: same review, same question, nothing new asked.
    const again = openManualEvidenceGates({
      workItem,
      journalStore: ctx.journalStore,
      questionStore: ctx.questionStore,
      askedByAgentId: workItem.assigneeAgentId as string,
    });
    expect(again.criteria).toEqual([]);
    expect(again.questionsCreated).toBe(0);
    expect(ctx.questionStore.list("pending")).toHaveLength(1);
  });

  it("asks about every undecidable criterion, including a second one in the same refusal", () => {
    // Measured 2026-09-30 on suite 08's fifth run: one refusal named `ac-3` and `ac-5`, a review was opened
    // for both, and only `ac-3` was asked about — so when the operator accepted `ac-3` the leaf stayed
    // blocked, the decision was durable, and there was no question anywhere for `ac-5`.
    const second = "A reviewer who knows the product agrees the ordering rule is the right one.";
    const { ctx, workItem } = seed([JUDGEMENT, second]);
    const opened = openManualEvidenceGates({
      workItem,
      journalStore: ctx.journalStore,
      questionStore: ctx.questionStore,
      askedByAgentId: workItem.assigneeAgentId as string,
      reason: "Acceptance criteria without evidence: ac-1, ac-2.",
    });

    expect(opened.criteria).toEqual(["ac-1", "ac-2"]);
    expect(opened.questionsCreated).toBe(2);
    const pending = ctx.questionStore.list("pending");
    expect(pending).toHaveLength(2);
    expect(pending.map((question) => question.question).join(" ")).toContain(
      manualEvidenceQuestionId(workItem.id, "ac-2"),
    );

    // Both answers are decisions about their own criterion, and both close it.
    for (const criterionId of ["ac-1", "ac-2"]) {
      const question = pending.find((candidate) =>
        candidate.question.includes(manualEvidenceQuestionId(workItem.id, criterionId)),
      )!;
      resolveManualEvidenceFromAnswer({
        journalStore: ctx.journalStore,
        questionText: question.question,
        answer: ACCEPT_OPTION,
        answeredByAgentId: ctx.agentStore.getAgentBySlugOrId("kampaku")!.id,
      });
    }
    const status = summarizeManualReviews(ctx.journalStore, workItem.id);
    expect(status.accepted.map((review) => review.criterionId).sort()).toEqual(["ac-1", "ac-2"]);
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore)).toEqual([]);
  });

  it("keeps the leaf blocked until the decision is taken, then lets it close", () => {
    const { ctx, workItem } = seed([DECIDABLE, JUDGEMENT]);
    expect(evaluateCriterionEvidenceGate(workItem, { evidence: [] }, { journalStore: ctx.journalStore })).toEqual({
      block: false,
    });

    openManualEvidenceGates({
      workItem,
      journalStore: ctx.journalStore,
      questionStore: ctx.questionStore,
      askedByAgentId: workItem.assigneeAgentId as string,
    });

    // A pending decision blocks: an open question is not evidence.
    const blocked = evaluateCriterionEvidenceGate(
      workItem,
      { evidence: [checkObservation()] },
      { journalStore: ctx.journalStore },
    );
    expect(blocked.block).toBe(true);
    if (blocked.block) expect(blocked.reason).toMatch(/ac-2/);

    const question = ctx.questionStore.list("pending")[0];
    const resolved = resolveManualEvidenceFromAnswer({
      journalStore: ctx.journalStore,
      questionText: question.question,
      answer: ACCEPT_OPTION,
      answeredByAgentId: ctx.agentStore.getAgentBySlugOrId("kampaku")!.id,
    });
    expect(resolved.map((review) => review.outcome)).toEqual(["accepted"]);
    expect(resolved.map((review) => review.criterionId)).toEqual(["ac-2"]);

    expect(
      evaluateCriterionEvidenceGate(
        workItem,
        { evidence: [checkObservation()] },
        { journalStore: ctx.journalStore },
      ),
      "an accepted decision is the evidence a judgement criterion needed",
    ).toEqual({ block: false });
  });

  it("records a refusal as a refusal, and says so instead of asking again", () => {
    const { ctx, workItem } = seed([DECIDABLE, JUDGEMENT]);
    openManualEvidenceGates({
      workItem,
      journalStore: ctx.journalStore,
      questionStore: ctx.questionStore,
      askedByAgentId: workItem.assigneeAgentId as string,
    });
    const question = ctx.questionStore.list("pending")[0];

    resolveManualEvidenceFromAnswer({
      journalStore: ctx.journalStore,
      questionText: question.question,
      answer: REJECT_OPTION,
      answeredByAgentId: ctx.agentStore.getAgentBySlugOrId("kampaku")!.id,
    });

    const status = summarizeManualReviews(ctx.journalStore, workItem.id);
    expect(status.rejected.map((review) => review.criterionId)).toEqual(["ac-2"]);
    expect(status.accepted).toEqual([]);
    const detail = manualEvidenceBlockDetail(ctx.journalStore, workItem.id) ?? "";
    expect(detail, "a refusal is reported as a refusal").toMatch(/rejected by the emperor: ac-2/);

    // And the same decision is not asked for twice.
    expect(manualCriteriaAwaitingDecision(workItem, ctx.journalStore)).toEqual([]);
  });

  it("does not accept a producer that certifies its own criterion as human-decided", () => {
    const { ctx, workItem } = seed([JUDGEMENT]);
    const forged = {
      criterionId: "ac-1",
      subjectType: "decision",
      format: "document",
      verificationMethod: "manual-review",
      subject: "manual review accepted for ac-1",
      passed: true,
      verified: true,
      reviewedByAgentId: "cli-lead",
      reference: "review-forged",
      observedAt: new Date().toISOString(),
    };
    const gate = evaluateCriterionEvidenceGate(
      workItem,
      { evidence: [forged] },
      { journalStore: ctx.journalStore },
    );
    expect(gate.block, "a job cannot sign off its own human gate").toBe(true);
    if (gate.block) expect(gate.reason).toMatch(/ac-1/);
  });

  it("reads the operator's own words as the decision", () => {
    expect(answerAcceptsCriterion(ACCEPT_OPTION)).toBe(true);
    expect(answerAcceptsCriterion(REJECT_OPTION)).toBe(false);
    expect(answerAcceptsCriterion("Rejected — the field names are wrong")).toBe(false);
    expect(answerAcceptsCriterion("Yes, the numbers are right")).toBe(true);
    expect(answerAcceptsCriterion("")).toBe(false);
    // The inverse reading works on the question as it is stored — the tagged JSON, not the bare id.
    const tagged = `<kampaku-question>${JSON.stringify({
      id: manualEvidenceQuestionId("wi-1", "ac-4"),
      type: "single_choice",
      prompt: "Is ac-4 met?",
      options: [ACCEPT_OPTION, REJECT_OPTION],
    })}</kampaku-question>`;
    expect(parseManualEvidenceQuestion(tagged)).toEqual({ workItemId: "wi-1", criterionId: "ac-4" });
  });

  /** The shape a fixed worker returns for a check it ran. */
  function checkObservation() {
    return {
      subjectType: "behavior",
      format: "code",
      verificationMethod: "command",
      subject: "test",
      passed: true,
      verified: true,
      reference: "make check",
      observedAt: new Date().toISOString(),
      criterionId: "check:test",
      sourceTool: "run_check",
    };
  }
});
