import { afterEach, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "../helpers/test-context.js";
import { createProject } from "../../src/application/projects.js";
import { identifyAcceptanceCriteria } from "../../src/application/pm/acceptance-criteria.js";
import {
  expandCriterionIds,
  evaluateEvidenceCoverage,
  listManualEvidenceReviews,
  manualReviewEvidence,
  reflectsCriterion,
  requestManualEvidenceReview,
  resolveManualEvidenceReview,
  summarizeManualReviews,
  validateEvidenceRecord,
  type CriterionEvidenceRecord,
} from "../../src/application/pm/evidence-review.js";
import { evaluateCriterionEvidenceGate } from "../../src/application/pm/done-honesty.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

function record(overrides: Partial<CriterionEvidenceRecord> = {}): CriterionEvidenceRecord {
  return {
    criterionId: "ac-1",
    subjectType: "behavior",
    format: "code",
    verificationMethod: "command",
    subject: "npm test passes",
    passed: true,
    verified: true,
    sourceTool: "run_check",
    observedAt: new Date().toISOString(),
    reference: "logs/npm-test.txt",
    ...overrides,
  };
}

describe("evidence coverage and proof", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  function workItem(criteria: string[]): WorkItemRecord {
    return {
      id: "item-1",
      projectId: "project-1",
      title: "Verify the deliverable",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: criteria,
      dependsOn: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function seed(criteria: string[]) {
    const ctx = createTestContext("kampaku-evidence-");
    context = ctx;
    const project = createProject(ctx.store, { slug: "project-1", name: "Project One", status: "active" });
    const now = new Date().toISOString();
    ctx.pmStore.createWorkItem({
      id: "item-1",
      projectId: project.id,
      title: "Verify the deliverable",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: criteria,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return ctx;
  }

  describe("one record covering many criteria", () => {
    it("expands a single record across every referenced criterion", () => {
      const ids = expandCriterionIds(record({ criterionId: "ac-1", criterionIds: ["ac-2", "ac-3", "ac-1"] }));
      expect(ids).toEqual(["ac-1", "ac-2", "ac-3"]);
    });

    it("covers all referenced criteria with one passing record", () => {
      const criteria = identifyAcceptanceCriteria([
        "npm test passes",
        "npm test reports the suite result",
        "npm run build passes",
      ]);
      const coverage = evaluateEvidenceCoverage(
        workItem(criteria.map((criterion) => criterion.text)),
        [
          record({ criterionId: "ac-1", criterionIds: ["ac-2"], subject: "npm test passes in the suite" }),
          record({ criterionId: "ac-3", subject: "npm run build passes", subjectType: "behavior" }),
        ],
        criteria,
      );
      expect(coverage.ok).toBe(true);
      expect(coverage.covered).toEqual(["ac-1", "ac-2", "ac-3"]);
    });
  });

  describe("rejecting evidence that does not prove its criterion", () => {
    it("rejects a command that proves something else", () => {
      const result = reflectsCriterion("npm run build passes", record({ subject: "docs/readme.md exists" }));
      expect(result.proves).toBe(false);
      expect(result.reason).toMatch(/does not reference the criterion/);
    });

    it("rejects a criterion that is not stated as an observable result", () => {
      const result = reflectsCriterion("the design feels modern", record({ subject: "design feels modern" }));
      expect(result.proves).toBe(false);
      expect(result.reason).toMatch(/not stated as an observable result/);
    });

    it("rejects model observation as proof without tool output", () => {
      const result = reflectsCriterion(
        "the report states the latency result",
        record({ subject: "report states the latency result", verificationMethod: "model-observation" }),
      );
      expect(result.proves).toBe(false);
      expect(result.reason).toMatch(/model observation alone/);
    });

    it("rejects a structurally invalid record", () => {
      expect(validateEvidenceRecord(record({ subjectType: "guess" }))).toMatch(/subjectType/);
      expect(validateEvidenceRecord(record({ verificationMethod: "vibes" }))).toMatch(/verificationMethod/);
      expect(validateEvidenceRecord(record({ observedAt: "not-a-date" }))).toMatch(/timestamp/);
      expect(validateEvidenceRecord(record({ criterionId: undefined }))).toMatch(/criterion/);
    });

    it("marks uncovered criteria as missing and unproven criteria as insufficient", () => {
      const criteria = identifyAcceptanceCriteria(["npm test passes", "npm run build passes"]);
      const coverage = evaluateEvidenceCoverage(
        workItem(criteria.map((criterion) => criterion.text)),
        [record({ criterionId: "ac-1", subject: "README.md exists" })],
        criteria,
      );
      expect(coverage.ok).toBe(false);
      expect(coverage.insufficient).toEqual(["ac-1"]);
      expect(coverage.missing).toEqual(["ac-2"]);
      expect(coverage.rejected[0]?.reason).toMatch(/does not reference the criterion/);
    });

    it("treats a failed record as insufficient, not as coverage", () => {
      const criteria = identifyAcceptanceCriteria(["npm test passes"]);
      const coverage = evaluateEvidenceCoverage(
        workItem(["npm test passes"]),
        [record({ criterionId: "ac-1", passed: false, subject: "npm test passes" })],
        criteria,
      );
      expect(coverage.covered).toEqual([]);
      expect(coverage.insufficient).toEqual(["ac-1"]);
    });
  });

  describe("manual evidence review workflow", () => {
    it("stays pending until a reviewer resolves it, and pending produces no evidence", () => {
      const ctx = seed(["the report states the latency result"]);
      requestManualEvidenceReview(ctx.journalStore, {
        projectId: "project-1",
        workItemId: "item-1",
        criterionId: "ac-1",
        requestedByAgentId: ctx.agentStore.getKampakuAgent().id,
        reason: "Only a human reviewer can judge this criterion.",
        evidence: "docs/report.md contains the measurement table.",
      });

      const status = summarizeManualReviews(ctx.journalStore, "item-1");
      expect(status.pending).toHaveLength(1);
      expect(manualReviewEvidence(ctx.journalStore, "item-1")).toEqual([]);
    });

    it("turns an accepted review into reviewable evidence", () => {
      const ctx = seed(["the report states the latency result"]);
      const kampaku = ctx.agentStore.getKampakuAgent();
      const review = requestManualEvidenceReview(ctx.journalStore, {
        projectId: "project-1",
        workItemId: "item-1",
        criterionId: "ac-1",
        requestedByAgentId: kampaku.id,
        reason: "Only a human reviewer can judge this criterion.",
      });

      resolveManualEvidenceReview(ctx.journalStore, {
        projectId: "project-1",
        workItemId: "item-1",
        reviewId: review.reviewId,
        reviewerAgentId: kampaku.id,
        outcome: "accepted",
        reason: "The measurement table matches the stated result.",
      });

      const evidence = manualReviewEvidence(ctx.journalStore, "item-1");
      expect(evidence).toHaveLength(1);
      expect(evidence[0]).toMatchObject({
        criterionId: "ac-1",
        verificationMethod: "manual-review",
        subjectType: "decision",
        passed: true,
      });
      expect(listManualEvidenceReviews(ctx.journalStore, "item-1")[0]?.outcome).toBe("accepted");
    });

    it("refuses to resolve the same review twice", () => {
      const ctx = seed(["the report states the latency result"]);
      const kampaku = ctx.agentStore.getKampakuAgent();
      const review = requestManualEvidenceReview(ctx.journalStore, {
        projectId: "project-1",
        workItemId: "item-1",
        criterionId: "ac-1",
        reason: "Only a human reviewer can judge this criterion.",
      });
      const first = {
        projectId: "project-1",
        workItemId: "item-1",
        reviewId: review.reviewId,
        reviewerAgentId: kampaku.id,
        outcome: "rejected" as const,
        reason: "The table is missing.",
      };
      resolveManualEvidenceReview(ctx.journalStore, first);
      expect(() => resolveManualEvidenceReview(ctx.journalStore, first)).toThrow(/already rejected/);
      expect(manualReviewEvidence(ctx.journalStore, "item-1")).toEqual([]);
    });

    it("requires an existing review", () => {
      const ctx = seed(["the report states the latency result"]);
      expect(() =>
        resolveManualEvidenceReview(ctx.journalStore, {
          projectId: "project-1",
          workItemId: "item-1",
          reviewId: "missing",
          reviewerAgentId: ctx.agentStore.getKampakuAgent().id,
          outcome: "accepted",
          reason: "Looks fine.",
        }),
      ).toThrow(/not found/);
    });
  });

  describe("closure gate", () => {
    it("blocks closure when a criterion has no evidence", () => {
      const ctx = seed(["npm test passes", "npm run build passes"]);
      const gate = evaluateCriterionEvidenceGate(
        workItem(["npm test passes", "npm run build passes"]),
        { evidence: [record({ criterionId: "ac-1", subject: "npm test passes" })] },
        { journalStore: ctx.journalStore },
      );
      expect(gate).toMatchObject({ block: true });
      expect((gate as { reason: string }).reason).toMatch(/ac-2/);
    });

    it("blocks closure while a manual review is still pending", () => {
      const ctx = seed(["the report states the latency result"]);
      requestManualEvidenceReview(ctx.journalStore, {
        projectId: "project-1",
        workItemId: "item-1",
        criterionId: "ac-1",
        reason: "Only a human reviewer can judge this criterion.",
      });
      const gate = evaluateCriterionEvidenceGate(
        workItem(["the report states the latency result"]),
        {
          evidence: [
            record({
              criterionId: "ac-1",
              subject: "the report states the latency result",
              verificationMethod: "file-inspection",
            }),
          ],
        },
        { journalStore: ctx.journalStore },
      );
      expect(gate).toMatchObject({ block: true });
      expect((gate as { reason: string }).reason).toMatch(/pending/);
    });

    it("allows closure once every criterion is proven", () => {
      const ctx = seed(["npm test passes"]);
      const gate = evaluateCriterionEvidenceGate(
        workItem(["npm test passes"]),
        { evidence: [record({ criterionId: "ac-1", subject: "npm test passes" })] },
        { journalStore: ctx.journalStore },
      );
      expect(gate).toEqual({ block: false });
    });

    it("leaves work items without criteria unaffected", () => {
      const ctx = seed([]);
      const gate = evaluateCriterionEvidenceGate(workItem([]), { evidence: [] }, { journalStore: ctx.journalStore });
      expect(gate).toEqual({ block: false });
    });
  });
});
