import { describe, it, expect } from "vitest";
import {
  resolveManualDoneActor,
  assertManualDoneAllowed,
  hasManualDoneEvidence,
  requiresPeerReview,
  hasApprovedPeerReview,
  jobFinishedWithoutChecks,
  ManualDoneError,
} from "../../../src/application/pm/done-honesty.js";
import type { WorkItemRecord } from "../../../src/persistence/pm-store.js";
import type { JobResultRecord } from "../../../src/persistence/store.js";

describe("done-honesty", () => {
  const mockItem = (overrides: Partial<WorkItemRecord> = {}): WorkItemRecord => ({
    id: "item-1",
    projectId: "proj-1",
    title: "Test Item",
    status: "todo",
    priority: 1,
    dependsOn: [],
    complexity: "M",
    acceptanceCriteria: [],
    parentId: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const mockResult = (overrides: Partial<JobResultRecord> = {}): JobResultRecord => ({
    id: "result-1",
    jobId: "job-1",
    status: "succeeded",
    finishedAt: "2025-01-15T10:00:00Z",
    ...overrides,
  });

  describe("resolveManualDoneActor", () => {
    it("returns emperor for kampaku slug", () => {
      expect(resolveManualDoneActor("kampaku")).toBe("emperor");
    });

    it("returns auditor for auditor slugs", () => {
      expect(resolveManualDoneActor("phase-auditor")).toBe("auditor");
      expect(resolveManualDoneActor("my-auditor")).toBe("auditor");
    });

    it("returns agent for regular agents", () => {
      expect(resolveManualDoneActor("worker-agent")).toBe("agent");
      expect(resolveManualDoneActor("alice")).toBe("agent");
    });

    it("returns agent when slug undefined", () => {
      expect(resolveManualDoneActor(undefined)).toBe("agent");
    });
  });

  describe("assertManualDoneAllowed", () => {
    it("allows emperor", () => {
      expect(() => assertManualDoneAllowed("emperor")).not.toThrow();
    });

    it("allows auditor", () => {
      expect(() => assertManualDoneAllowed("auditor")).not.toThrow();
    });

    it("blocks agent", () => {
      expect(() => assertManualDoneAllowed("agent")).toThrow(ManualDoneError);
      expect(() => assertManualDoneAllowed("agent")).toThrow("Manual status=done is blocked");
    });
  });

  describe("hasManualDoneEvidence", () => {
    it("returns true for completion_report", () => {
      expect(hasManualDoneEvidence([{ kind: "completion_report" }])).toBe(true);
    });

    it("returns true for phase_gate", () => {
      expect(hasManualDoneEvidence([{ kind: "phase_gate" }])).toBe(true);
    });

    it("returns true for deliverable_audit", () => {
      expect(hasManualDoneEvidence([{ kind: "deliverable_audit" }])).toBe(true);
    });

    it("returns false for other kinds", () => {
      expect(hasManualDoneEvidence([{ kind: "delegation" }])).toBe(false);
      expect(hasManualDoneEvidence([{ kind: "question_raised" }])).toBe(false);
    });

    it("returns false for empty array", () => {
      expect(hasManualDoneEvidence([])).toBe(false);
    });
  });

  describe("requiresPeerReview", () => {
    it("returns true for security keyword", () => {
      expect(requiresPeerReview(mockItem({ title: "Security audit" }))).toBe(true);
      expect(requiresPeerReview(mockItem({ description: "Add security feature" }))).toBe(true);
    });

    it("returns true for architecture keyword", () => {
      expect(requiresPeerReview(mockItem({ title: "Architectural decision" }))).toBe(true);
      expect(requiresPeerReview(mockItem({ title: "Architecture design" }))).toBe(true);
    });

    it("returns true for API keyword", () => {
      expect(requiresPeerReview(mockItem({ title: "API design" }))).toBe(true);
    });

    it("returns true for release keyword", () => {
      expect(requiresPeerReview(mockItem({ title: "Release preparation" }))).toBe(true);
    });

    it("returns true for QA/quality keyword", () => {
      expect(requiresPeerReview(mockItem({ title: "QA checklist" }))).toBe(true);
      expect(requiresPeerReview(mockItem({ title: "Quality assurance" }))).toBe(true);
    });

    it("returns true for high-impact keyword", () => {
      expect(requiresPeerReview(mockItem({ title: "High-impact change" }))).toBe(true);
      expect(requiresPeerReview(mockItem({ title: "High impact feature" }))).toBe(true);
    });

    it("returns true for critical keyword", () => {
      expect(requiresPeerReview(mockItem({ title: "Critical bug fix" }))).toBe(true);
    });

    it("searches acceptance criteria", () => {
      expect(requiresPeerReview(mockItem({ acceptanceCriteria: ["Security requirements"] }))).toBe(true);
    });

    it("returns false for normal tasks", () => {
      expect(requiresPeerReview(mockItem({ title: "Add button" }))).toBe(false);
      expect(requiresPeerReview(mockItem({ title: "Fix typo" }))).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(requiresPeerReview(mockItem({ title: "SECURITY review" }))).toBe(true);
    });
  });

  describe("hasApprovedPeerReview", () => {
    it("returns true when approved peer review exists", () => {
      const entries = [
        { kind: "peer_review_updated", metadata: { status: "approved" } },
      ];
      expect(hasApprovedPeerReview(entries)).toBe(true);
    });

    it("returns false for requested peer review", () => {
      const entries = [
        { kind: "peer_review_updated", metadata: { status: "requested" } },
      ];
      expect(hasApprovedPeerReview(entries)).toBe(false);
    });

    it("returns false for other journal entries", () => {
      const entries = [
        { kind: "delegation", metadata: {} },
      ];
      expect(hasApprovedPeerReview(entries)).toBe(false);
    });

    it("returns false for empty array", () => {
      expect(hasApprovedPeerReview([])).toBe(false);
    });
  });

  describe("jobFinishedWithoutChecks", () => {
    it("returns true when stalledAfterDeliverables", () => {
      const result = mockResult({ output: { stalledAfterDeliverables: true } });
      expect(jobFinishedWithoutChecks(result)).toBe(true);
    });

    it("returns true when iterationLimitReached", () => {
      const result = mockResult({ output: { iterationLimitReached: true } });
      expect(jobFinishedWithoutChecks(result)).toBe(true);
    });

    it("returns false when neither flag set", () => {
      const result = mockResult({ output: {} });
      expect(jobFinishedWithoutChecks(result)).toBe(false);
    });

    it("returns false when result undefined", () => {
      expect(jobFinishedWithoutChecks(undefined)).toBe(false);
    });

    it("returns false when output undefined", () => {
      const result = mockResult({ output: undefined });
      expect(jobFinishedWithoutChecks(result)).toBe(false);
    });
  });
});
