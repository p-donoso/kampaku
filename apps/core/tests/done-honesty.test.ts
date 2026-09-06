import { describe, expect, it } from "vitest";
import {
  assertManualDoneAllowed,
  hasManualDoneEvidence,
  hasApprovedPeerReview,
  requiresPeerReview,
  jobFinishedWithoutChecks,
  ManualDoneError,
  resolveManualDoneActor,
  shouldBlockDishonestSuccess,
} from "../src/application/pm/done-honesty.js";
import { isStubAuditText } from "../src/application/pm/phase-auditor-gate.js";
import type { WorkItemRecord } from "../src/persistence/pm-store.js";

function item(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: "leaf-1",
    projectId: "p1",
    title: "Leaf",
    status: "in_progress",
    priority: 0,
    sortOrder: 0,
    acceptanceCriteria: [],
    dependsOn: [],
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("done honesty", () => {
  it("blocks stall success when no required checks exist", () => {
    const result = shouldBlockDishonestSuccess(item(), {
      jobId: "j1",
      leaseId: "l1",
      status: "succeeded",
      output: { stalledAfterDeliverables: true, summary: "wrote files" },
      finishedAt: "",
    });
    expect(result.block).toBe(true);
  });

  it("allows stall success when required checks passed", () => {
    const result = shouldBlockDishonestSuccess(
      item({ acceptanceCriteria: ["npm test succeeds"] }),
      {
        jobId: "j1",
        leaseId: "l1",
        status: "succeeded",
        output: { stalledAfterDeliverables: true, checkResults: { test: true } },
        finishedAt: "",
      },
    );
    expect(result.block).toBe(false);
  });

  it("blocks stub auditor artifacts", () => {
    expect(isStubAuditText('{"status":"ready"}')).toBe(true);
    expect(isStubAuditText("short")).toBe(true);
    const honest = [
      "# Deliverable audit — demo",
      "**Verdict:** needs-work (**6/10**)",
      "Baseline comparison: better than the ~2/10 reference because the scaffold exists, but core user paths are unwired.",
      "Score details with evidence from src/App.tsx, src/components/Canvas.tsx, and npm test stdout follow in this report.",
      "Findings include wiring gaps, wiki fiction, and hollow CI scripts that must be repaired before any public GitHub push.",
      "Recommendations: wire drawing tools, replace noop lint, and rewrite wiki to match the Vite stack actually on disk.",
    ].join("\n");
    expect(isStubAuditText(honest)).toBe(false);

    const blocked = shouldBlockDishonestSuccess(
      item({
        routingReason: "phase_gate:phase-1",
        acceptanceCriteria: ["file exists at docs/audit/latest.md"],
      }),
      {
        jobId: "j1",
        leaseId: "l1",
        status: "succeeded",
        output: { summary: '{"status":"ready"}' },
        finishedAt: "",
      },
    );
    expect(blocked.block).toBe(true);
  });

  it("rejects manual done from specialist agents", () => {
    expect(resolveManualDoneActor("demo-frontend")).toBe("agent");
    expect(resolveManualDoneActor("kampaku")).toBe("emperor");
    expect(resolveManualDoneActor("demo-auditor")).toBe("auditor");
    expect(() => assertManualDoneAllowed("agent")).toThrow(ManualDoneError);
    expect(() => assertManualDoneAllowed("emperor")).not.toThrow();
  });

  it("requires journal evidence for auditor closure", () => {
    expect(hasManualDoneEvidence([])).toBe(false);
    expect(hasManualDoneEvidence([{ kind: "question_raised" }])).toBe(false);
    expect(hasManualDoneEvidence([{ kind: "completion_report" }])).toBe(true);
    expect(hasManualDoneEvidence([{ kind: "phase_gate" }])).toBe(true);
  });

  it("requires an approved peer review for sensitive work", () => {
    expect(requiresPeerReview(item({ title: "Review security boundary" }))).toBe(true);
    expect(hasApprovedPeerReview([{ kind: "peer_review_updated", metadata: { status: "changes_requested" } }])).toBe(false);
    expect(hasApprovedPeerReview([{ kind: "peer_review_updated", metadata: { status: "approved" } }])).toBe(true);
    expect(shouldBlockDishonestSuccess(item({ title: "Review API contract" }), undefined).block).toBe(true);
    expect(shouldBlockDishonestSuccess(
      item({ title: "Review API contract" }),
      undefined,
      [{ kind: "peer_review_updated", metadata: { status: "approved" } }],
    ).block).toBe(false);
  });

  it("detects stalled or iteration-limited jobs", () => {
    expect(
      jobFinishedWithoutChecks({
        jobId: "j",
        leaseId: "l",
        status: "succeeded",
        output: { iterationLimitReached: true },
        finishedAt: "",
      }),
    ).toBe(true);
  });
});
