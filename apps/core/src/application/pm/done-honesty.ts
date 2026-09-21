import type { WorkItemRecord } from "../../persistence/pm-store.js";
import { isPhaseGateWorkItem, isStubAuditText, auditArtifactIsHonest } from "./phase-auditor-gate.js";
import { evaluateJobCheckResults, inferRequiredChecksFromWorkItem } from "./work-item-checks.js";
import type { JobResultRecord } from "../../persistence/store.js";
import { evaluateQualityGate } from "./quality-gates.js";
import {
  evaluateEvidenceCoverage,
  manualReviewEvidence,
  summarizeManualReviews,
  type CriterionEvidenceRecord,
} from "./evidence-review.js";
import { identifyAcceptanceCriteria } from "./acceptance-criteria.js";
import type { JournalStore } from "../../persistence/journal-store.js";

export class ManualDoneError extends Error {
  readonly code = "DISHONEST_DONE";

  constructor(message: string) {
    super(message);
    this.name = "ManualDoneError";
  }
}

export type ManualDoneActor = "emperor" | "auditor" | "agent";

export function resolveManualDoneActor(agentSlug?: string): ManualDoneActor {
  if (!agentSlug) return "agent";
  if (agentSlug === "kampaku") return "emperor";
  if (agentSlug.endsWith("-auditor")) return "auditor";
  return "agent";
}

export function assertManualDoneAllowed(actor: ManualDoneActor): void {
  if (actor === "emperor" || actor === "auditor") return;
  throw new ManualDoneError(
    "Manual status=done is blocked. Tasks become done from passing worker checks, or via emperor/auditor override.",
  );
}

export function hasManualDoneEvidence(entries: Array<{ kind: string }>): boolean {
  return entries.some((entry) =>
    ["completion_report", "phase_gate", "deliverable_audit"].includes(entry.kind),
  );
}

export function requiresPeerReview(workItem: WorkItemRecord): boolean {
  const text = [workItem.title, workItem.description, ...workItem.acceptanceCriteria].filter(Boolean).join(" ");
  if (/\b(research|documentation)\b/i.test(workItem.title)) {
    return /security|architect(?:ure|ural)|release|qa|quality|high[- ]impact|critical/i.test(text);
  }
  return /security|architect(?:ure|ural)|release|qa|quality|high[- ]impact|critical/i.test(text)
    || /\bapi\s+(?:contract|endpoint|schema|implementation|integration)\b/i.test(text);
}

export function hasApprovedPeerReview(entries: Array<{ kind: string; metadata: Record<string, unknown> }>): boolean {
  return entries.some((entry) =>
    entry.kind === "peer_review_updated" && entry.metadata.status === "approved",
  );
}

function jobOutput(result?: JobResultRecord): Record<string, unknown> {
  return result?.output && typeof result.output === "object" ? (result.output as Record<string, unknown>) : {};
}

export function jobFinishedWithoutChecks(result?: JobResultRecord): boolean {
  const output = jobOutput(result);
  return output.stalledAfterDeliverables === true || output.iterationLimitReached === true;
}

function hasVerifiedDeliverable(output: Record<string, unknown>): boolean {
  return Array.isArray(output.verificationResults)
    && output.verificationResults.some((entry) =>
      Boolean(entry) && typeof entry === "object" && (entry as { ok?: unknown }).ok === true,
    );
}

function evaluateStructuredEvidence(output: Record<string, unknown>): { present: boolean; failed: string[] } {
  if (!Array.isArray(output.evidence)) return { present: false, failed: [] };
  const failed: string[] = [];
  for (const entry of output.evidence) {
    if (!entry || typeof entry !== "object") {
      failed.push("invalid evidence record");
      continue;
    }
    const record = entry as { subjectType?: unknown; subject?: unknown; passed?: unknown; observedAt?: unknown; criterionId?: unknown };
    if (!(typeof record.subjectType === "string" && typeof record.subject === "string" && typeof record.observedAt === "string" && typeof record.passed === "boolean" && typeof record.criterionId === "string")) {
      failed.push("invalid evidence record");
    } else if (!record.passed) {
      failed.push(record.subject);
    }
  }
  return { present: true, failed };
}

export interface EvidenceGateInput {
  /** Journal store used to resolve manual evidence reviews. */
  journalStore?: JournalStore;
  /** Maximum pending manual reviews allowed before closure is blocked. Defaults to 0. */
  maxPendingManualReviews?: number;
}

/**
 * Blocks closure when acceptance criteria are not individually proven.
 *
 * Rejected or pending manual reviews count as missing evidence, so a criterion
 * that needs a human decision cannot be closed by a passing command elsewhere.
 */
export function evaluateCriterionEvidenceGate(
  workItem: WorkItemRecord,
  output: Record<string, unknown>,
  gate: EvidenceGateInput = {},
): { block: true; reason: string } | { block: false } {
  const structured = Array.isArray(output.evidence)
    ? (output.evidence.filter((entry) => entry && typeof entry === "object") as CriterionEvidenceRecord[])
    : [];
  const manual = manualReviewEvidence(gate.journalStore, workItem.id);
  const criteria = identifyAcceptanceCriteria(workItem.acceptanceCriteria ?? []);
  if (criteria.length === 0) return { block: false };

  const pending = summarizeManualReviews(gate.journalStore, workItem.id).pending.length;
  const maxPending = gate.maxPendingManualReviews ?? 0;

  // Without structured evidence the legacy check-result path already decides
  // closure, so only pending manual reviews can add a new blocker here.
  if (structured.length === 0) {
    if (pending > maxPending) {
      return {
        block: true,
        reason: `${pending} manual evidence review(s) are still pending; resolve them before closure.`,
      };
    }
    return { block: false };
  }

  const coverage = evaluateEvidenceCoverage(workItem, [...structured, ...manual], criteria);

  if (coverage.missing.length > 0) {
    return {
      block: true,
      reason: `Acceptance criteria without evidence: ${coverage.missing.join(", ")}.`,
    };
  }
  if (coverage.insufficient.length > 0) {
    const detail = coverage.criteria
      .filter((criterion) => criterion.status === "insufficient")
      .map((criterion) => `${criterion.criterionId}: ${criterion.reasons.join("; ")}`)
      .join(" | ");
    return {
      block: true,
      reason: `Evidence does not prove these criteria: ${coverage.insufficient.join(", ")}. ${detail}`,
    };
  }
  if (pending > maxPending) {
    return {
      block: true,
      reason: `${pending} manual evidence review(s) are still pending; resolve them before closure.`,
    };
  }
  return { block: false };
}

export function shouldBlockDishonestSuccess(
  workItem: WorkItemRecord,
  result?: JobResultRecord,
  journalEntries: Array<{ kind: string; metadata: Record<string, unknown> }> = [],
  reportingStatus?: { completionReport: boolean; privateMemory: boolean; wikiSync?: boolean },
  evidenceGate: EvidenceGateInput = {},
): { block: true; reason: string } | { block: false } {
  const requiredChecks = inferRequiredChecksFromWorkItem(workItem);
  const output = jobOutput(result);
  const checkEval = evaluateJobCheckResults(
    requiredChecks,
    output.checkResults as Record<string, unknown> | undefined,
  );

  const evidence = evaluateStructuredEvidence(output);
  if (evidence.failed.length > 0) {
    return { block: true, reason: `Structured evidence failed: ${evidence.failed.join(", ")}.` };
  }
  const quality = evaluateQualityGate({ summary: typeof output.summary === "string" ? output.summary : undefined, iterationLimitReached: output.iterationLimitReached === true, requiredChecks: output.checkResults as Record<string, unknown> | undefined, evidence: Array.isArray(output.evidence) ? output.evidence as Array<{ passed?: unknown; verified?: unknown; reference?: unknown }> : undefined });
  if (!quality.ok) return { block: true, reason: quality.reasons.join(" ") };

  if (jobFinishedWithoutChecks(result) && requiredChecks.length === 0 && !hasVerifiedDeliverable(output)) {
    return {
      block: true,
      reason: "Job stalled or hit the iteration limit without required checks; not marking done.",
    };
  }

  if (!checkEval.ok) {
    return { block: true, reason: checkEval.message };
  }

  const criterionGate = evaluateCriterionEvidenceGate(workItem, output, evidenceGate);
  if (criterionGate.block) return criterionGate;

  if (requiresPeerReview(workItem) && !hasApprovedPeerReview(journalEntries)) {
    return { block: true, reason: "Sensitive work requires an approved peer review before closure." };
  }

  if (requiresPeerReview(workItem) && reportingStatus && (!reportingStatus.completionReport || !reportingStatus.privateMemory || reportingStatus.wikiSync === false)) {
    return { block: true, reason: "Sensitive work requires synchronized superior-journal, private-memory, and required wiki reporting before closure." };
  }

  if (isPhaseGateWorkItem(workItem)) {
    const summary = typeof output.summary === "string" ? output.summary : undefined;
    const repositoryPath = typeof output.repositoryPath === "string" ? output.repositoryPath : undefined;
    if (!auditArtifactIsHonest({ repositoryPath, summary })) {
      return {
        block: true,
        reason: "Phase auditor artifact missing or stub (need docs/audit/latest.md with verdict and score).",
      };
    }
    if (summary && isStubAuditText(summary) && !repositoryPath) {
      return { block: true, reason: "Phase auditor produced a stub summary without a repo artifact." };
    }
  }

  return { block: false };
}
