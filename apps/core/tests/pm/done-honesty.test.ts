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
} from "../../src/application/pm/done-honesty.js";
import { isStubAuditText } from "../../src/application/pm/phase-auditor-gate.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

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

  it("allows stall success when required checks passed and no structured evidence is present", () => {
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

  it("allows a stalled document task when its written deliverable was verified", () => {
    const result = shouldBlockDishonestSuccess(item(), {
      jobId: "j1",
      leaseId: "l1",
      status: "succeeded",
      output: { stalledAfterDeliverables: true, verificationResults: [{ path: "docs/research.md", ok: true }] },
      finishedAt: "",
    });
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
    expect(requiresPeerReview(item({ title: "Research API documentation" }))).toBe(false);
    expect(requiresPeerReview(item({ title: "Research API documentation", description: "Document an API integration" }))).toBe(false);
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

/**
 * **An observation of a failure is not a dishonest success.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r16`. The read-only Phase A container's job carried its children's
 * evidence — among it `test: false`, the honest record of the runner that is red because the repository is broken —
 * and the container was blocked `evidence_failed: test`, which refused every repair leaf beneath it, including two
 * that had already succeeded. The container above a diagnosis exists to hold the diagnosis; a red check recorded in
 * it is the finding, not a lie.
 */
describe("structured evidence and the checks an item had to pass (suite 19 / s19r16)", () => {
  const measuredEvidence = (passed: boolean) => [
    {
      subjectType: "behavior",
      format: "code",
      verificationMethod: "command",
      subject: "test",
      passed,
      verified: true,
      reference: "./run-tests.sh",
      observedAt: "2026-11-09T14:20:06.995Z",
      // Core fills the criterion link the producer did not write (`keyEvidenceToCriteria`); the recorded result is
      // the one the run carried.
      criterionId: "ac-1",
      sourceTool: "run_check",
    },
  ];

  const readOnlyContainer = () =>
    item({
      title: "Phase A - Diagnosis and defect attribution (read-only)",
      // The criterion names the check the repository declares, which is how the run's own evidence keyed to it.
      acceptanceCriteria: ["The `test` check was run and its failing output recorded verbatim."],
    });

  it("does not refuse a read-only container for recording the check it was told not to fix", () => {
    const result = shouldBlockDishonestSuccess(
      readOnlyContainer(),
      { jobId: "j1", leaseId: "l1", status: "succeeded", output: { summary: "recorded", evidence: measuredEvidence(false) }, finishedAt: "" },
      [],
      undefined,
      { requiredChecks: [] },
    );
    expect(result.block).toBe(false);
  });

  it("does not refuse it for the recorded result of the check either", () => {
    // The same finding, third reader: `evaluateQualityGate`'s check-record arm refused any non-true value, so the
    // read-only leaf's honest `test: false` (measured on run `s19r17`) closed the container one arm after the other.
    const result = shouldBlockDishonestSuccess(
      readOnlyContainer(),
      {
        jobId: "j3",
        leaseId: "l3",
        status: "succeeded",
        output: { summary: "recorded", evidence: measuredEvidence(false), checkResults: { test: false } },
        finishedAt: "",
      },
      [],
      undefined,
      { requiredChecks: [] },
    );
    expect(result.block).toBe(false);
  });

  it("still refuses a leaf whose required check is recorded failed", () => {
    const result = shouldBlockDishonestSuccess(
      item({ title: "Repair the parser", acceptanceCriteria: ["`./run-tests.sh` exits 0."] }),
      { jobId: "j2", leaseId: "l2", status: "succeeded", output: { summary: "fixed", evidence: measuredEvidence(false) }, finishedAt: "" },
      [],
      undefined,
      { requiredChecks: ["test"] },
    );
    expect(result.block).toBe(true);
    if (result.block) expect(result.code).toBe("evidence_failed");
  });
});
