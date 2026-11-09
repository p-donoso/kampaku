/**
 * @module application/pm/evidence-review
 * Criterion-level evidence coverage, content proof, and manual review.
 *
 * This module answers four questions Core must be able to defend:
 * 1. Which acceptance criteria have evidence, and which do not?
 * 2. Does a given evidence record actually prove the criterion it claims?
 * 3. Can one record cover several criteria without weakening the claim?
 * 4. What happens to evidence only a human can judge?
 */

import type { JournalStore, JournalEntryKind, WorkItemJournalEntryRecord } from "../../persistence/journal-store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";
import { EVIDENCE_METHODS, EVIDENCE_SUBJECT_TYPES } from "./evidence-registry.js";
import { OBSERVABLE_RESULT_KEYWORDS } from "./criterion-observability.js";
import { parseCriterionChecks } from "./criterion-checks.js";

/** Bounded diagnostics kept beside each evidence record. */
export interface EvidenceDiagnostics {
  /** Tool output excerpt that produced the observation. */
  output?: string;
  /** Structured diagnostic payload, for example a check exit code or HTTP status. */
  diagnostics?: Record<string, unknown>;
  /** Reference to the job log the observation came from. */
  logRef?: string;
}

export interface CriterionEvidenceRecord extends EvidenceDiagnostics {
  criterionId?: string;
  /** Additional criteria this single record covers. */
  criterionIds?: string[];
  subjectType?: string;
  format?: string;
  verificationMethod?: string;
  subject?: string;
  passed?: boolean;
  verified?: boolean;
  sourceTool?: string;
  observedAt?: string;
  reference?: string;
  /** Set when the evidence came from a human reviewer instead of a tool. */
  reviewedByAgentId?: string;
}

export interface CriterionCoverage {
  criterionId: string;
  status: "covered" | "insufficient" | "missing";
  evidenceReferences: string[];
  reasons: string[];
}

export interface EvidenceCoverageReport {
  ok: boolean;
  covered: string[];
  insufficient: string[];
  missing: string[];
  /** Coverage keyed by criterion id, with per-criterion reasons. */
  criteria: CriterionCoverage[];
  /** Records rejected because they could not prove their criterion. */
  rejected: Array<{ criterionId: string; subject: string; reason: string }>;
}

const MAX_DIAGNOSTIC_CHARS = 2_000;

function bounded(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.length <= MAX_DIAGNOSTIC_CHARS ? text : `${text.slice(0, MAX_DIAGNOSTIC_CHARS)}…`;
}

/** Expands a record that covers several criteria into one entry per criterion. */
export function expandCriterionIds(record: CriterionEvidenceRecord): string[] {
  const ids = new Set<string>();
  if (record.criterionId?.trim()) ids.add(record.criterionId.trim());
  for (const id of record.criterionIds ?? []) {
    if (id.trim()) ids.add(id.trim());
  }
  return [...ids];
}

/**
 * Validates the structural part of an evidence record.
 *
 * @returns The rejection reason, or undefined when the record is well formed.
 */
export function validateEvidenceRecord(record: CriterionEvidenceRecord): string | undefined {
  if (typeof record.subjectType !== "string" || !(EVIDENCE_SUBJECT_TYPES as readonly string[]).includes(record.subjectType)) {
    return "invalid evidence subjectType";
  }
  if (typeof record.verificationMethod !== "string" || !(EVIDENCE_METHODS as readonly string[]).includes(record.verificationMethod)) {
    return "invalid evidence verificationMethod";
  }
  if (typeof record.subject !== "string" || record.subject.trim().length === 0) return "missing evidence subject";
  if (typeof record.passed !== "boolean") return "missing evidence pass/fail state";
  if (typeof record.observedAt !== "string" || Number.isNaN(Date.parse(record.observedAt))) {
    return "invalid evidence observation timestamp";
  }
  if (expandCriterionIds(record).length === 0) return "evidence must reference at least one criterion";
  return undefined;
}

// The observability vocabulary lives in one place, because the router and the prover must agree about which
// criteria a tool can decide. See `criterion-observability.ts` for why that matters (BOARD F-077).
const PROOF_KEYWORDS = OBSERVABLE_RESULT_KEYWORDS;

/**
 * Decides whether a record can prove the criterion it claims.
 *
 * Two rules keep this honest:
 * - The criterion must be stated as something observable. A vague criterion
 *   cannot be proven by a tool observation, so it is rejected for automation.
 * - The evidence subject must relate to the criterion. A command that passes
 *   somewhere else in the repository does not prove an unrelated deliverable.
 */
export function reflectsCriterion(
  criterionText: string,
  record: CriterionEvidenceRecord,
): { proves: boolean; reason?: string } {
  const criterion = criterionText.trim();
  const subject = (record.subject ?? "").trim();

  if (!criterion) return { proves: false, reason: "criterion text is empty" };
  if (!subject) return { proves: false, reason: "evidence subject is empty" };

  // A human decision is not related to its criterion by *wording*: the review names the criterion by id, and
  // the operator decided that criterion and no other. Applying the wording test to it makes a
  // judgement-shaped criterion unclosable — measured 2026-09-30 on suite 08's fourth run, where
  // `manualReviewEvidence`'s record ("manual review accepted for ac-4") shared no token with the criterion it
  // answered, so a recorded decision had no effect (BOARD F-082). Two conditions replace the wording test:
  // the record must be a review (see `manualReviewEvidence`, which groups by criterion id, and
  // `evaluateCriterionEvidenceGate`, which refuses a *producer*-declared one) and it must name the person who
  // took the decision — a record that certifies itself as human-reviewed without a reviewer is exactly how a
  // job would forge one.
  if (record.verificationMethod === "manual-review") {
    return record.reviewedByAgentId
      ? { proves: true }
      : { proves: false, reason: "a manual review must name the reviewer who took the decision" };
  }

  if (!PROOF_KEYWORDS.test(criterion)) {
    return {
      proves: false,
      reason: "criterion is not stated as an observable result, so tool evidence cannot prove it",
    };
  }

  const tokens = criterion
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .filter((token) => token.length >= 4);
  const haystack = `${subject} ${record.format ?? ""} ${record.sourceTool ?? ""}`.toLowerCase();
  const related = tokens.some((token) => haystack.includes(token));
  if (!related) {
    return {
      proves: false,
      reason: `evidence subject "${subject}" does not reference the criterion being claimed`,
    };
  }

  if (record.verificationMethod === "model-observation") {
    return {
      proves: false,
      reason: "model observation alone cannot prove a criterion; attach the tool output that produced it",
    };
  }

  return { proves: true };
}

/**
 * Builds the criterion-level coverage report for a work item.
 *
 * One record may cover several criteria. A criterion is only `covered` when at
 * least one referencing record is structurally valid, proves the criterion, and
 * records a pass. Anything else is reported as `insufficient`, never silently
 * dropped.
 */
export function evaluateEvidenceCoverage(
  workItem: Pick<WorkItemRecord, "acceptanceCriteria">,
  evidence: CriterionEvidenceRecord[] = [],
  criteriaWithIds: Array<{ id: string; text: string }> = [],
  /** The checks this item had to make green; absent means every recorded result is judged. */
  evidenceOnly = false,
): EvidenceCoverageReport {
  // Criteria are addressed by stable `ac-N` ids when the caller provides them.
  // Without ids the text itself is the key so coverage is still per criterion.
  const criterionText = new Map<string, string>();
  if (criteriaWithIds.length > 0) {
    for (const criterion of criteriaWithIds) criterionText.set(criterion.id, criterion.text);
  } else {
    for (const text of workItem.acceptanceCriteria ?? []) criterionText.set(text, text);
  }

  const byCriterion = new Map<string, CriterionEvidenceRecord[]>();
  for (const record of evidence) {
    for (const id of expandCriterionIds(record)) {
      byCriterion.set(id, [...(byCriterion.get(id) ?? []), record]);
    }
  }

  const report: EvidenceCoverageReport = {
    ok: true,
    covered: [],
    insufficient: [],
    missing: [],
    criteria: [],
    rejected: [],
  };

  for (const criterionId of criterionText.keys()) {
    const text = criterionText.get(criterionId) ?? "";
    const records = byCriterion.get(criterionId) ?? [];
    if (records.length === 0) {
      report.missing.push(criterionId);
      report.criteria.push({ criterionId, status: "missing", evidenceReferences: [], reasons: ["no evidence references this criterion"] });
      continue;
    }

    const reasons: string[] = [];
    const references: string[] = [];
    let proven = false;

    for (const record of records) {
      const structural = validateEvidenceRecord(record);
      if (structural) {
        reasons.push(structural);
        report.rejected.push({ criterionId, subject: record.subject ?? "unknown", reason: structural });
        continue;
      }
      const proof = reflectsCriterion(text, record);
      if (!proof.proves) {
        reasons.push(proof.reason ?? "evidence does not prove the criterion");
        report.rejected.push({
          criterionId,
          subject: record.subject!,
          reason: proof.reason ?? "evidence does not prove the criterion",
        });
        continue;
      }
      references.push(record.reference ?? record.subject!);
      if (record.verified === false) {
        reasons.push(`evidence unverified: ${record.subject}`);
        continue;
      }
      if (record.passed === false) {
        // Only a failure this item had to fix. A diagnosis records the red check it was sent to find, and reading
        // that as a failed criterion is how the honest leaf cannot close — measured 2026-11-09 on suite 19 run
        // `s19r16`, the third reader of one rule (`quality-gates.ts` and `done-honesty.ts` hold the other two). When
        // the check is out of scope the record is not a gate at all: it is the observation the criterion asked for,
        // so it proves it.
        if (evidenceOnly !== true) {
          reasons.push(`evidence failed: ${record.subject}`);
          continue;
        }
      }
      proven = true;
    }

    if (proven) {
      report.covered.push(criterionId);
      report.criteria.push({ criterionId, status: "covered", evidenceReferences: references, reasons: [] });
    } else {
      report.insufficient.push(criterionId);
      report.criteria.push({
        criterionId,
        status: "insufficient",
        evidenceReferences: references,
        reasons: reasons.length > 0 ? reasons : ["no passing evidence record proves this criterion"],
      });
    }
  }

  report.ok = report.missing.length === 0 && report.insufficient.length === 0;
  return report;
}

/**
 * The tool that produced an observation, mapped to the criterion kinds it can decide.
 *
 * `verify_file` answers for a document as well as an artifact, because a document criterion is an artifact
 * criterion with a format attached. Nothing maps to `manual`: a judgement cannot be produced by a tool, and
 * that the mapping is silent about it is the point.
 */
const OBSERVATION_KINDS: Record<string, string[]> = {
  run_check: ["command"],
  verify_file: ["artifact", "document"],
  inspect_artifact: ["artifact", "document"],
  inspect_document: ["document", "artifact"],
  inspect_image: ["image"],
  inspect_media: ["media"],
  inspect_ui: ["ui"],
  request_endpoint: ["endpoint"],
  query_dataset: ["dataset"],
};

/**
 * Keys a tool observation to the criteria it can prove, for the case where the producer did not name them.
 *
 * The evidence model asks the producer to say which criterion an observation supports, and `reflectsCriterion`
 * validates that claim. The split is right and is kept: this does not weaken the proof test, it only supplies
 * the link. What it fixes is that the two ends used different vocabularies. Measured 2026-09-30 (BOARD
 * F-077): the worker keys its observations to the **check** it ran (`check:lint`) and the **artifact** it
 * inspected (`artifact:docs/architecture/cli.md`), while coverage is computed per `ac-N` — so every criterion
 * was `missing`, and no job, however honest and well-evidenced, could ever close a leaf.
 *
 * A criterion is keyed to an observation only when all of this holds:
 *
 * - the plan's own routing (`parseCriterionChecks`) assigns that criterion a verifier in the observation's
 *   kind family — so a `run_check` observation is never offered for a criterion the plan routes elsewhere;
 * - `reflectsCriterion` passes, which is the same test a producer-named link must pass: the criterion states
 *   an observable result and its subject relates to the observation;
 * - the record does not already name a criterion of this work item, in which case the producer's own link
 *   wins and nothing is added.
 *
 * A `manual` criterion is never keyed, because no tool family maps to it. That is deliberate: a criterion the
 * product cannot witness stays a human gate rather than being closed by whatever tool happened to pass.
 */
export function keyEvidenceToCriteria(
  criteriaWithIds: Array<{ id: string; text: string }>,
  evidence: CriterionEvidenceRecord[] = [],
): CriterionEvidenceRecord[] {
  if (criteriaWithIds.length === 0 || evidence.length === 0) return evidence;

  const known = new Set(criteriaWithIds.map((criterion) => criterion.id));
  const kindByCriterion = new Map(
    parseCriterionChecks(criteriaWithIds).map((check) => [check.criterionId, check.kind]),
  );

  return evidence.map((record) => {
    if (expandCriterionIds(record).some((id) => known.has(id))) return record;

    const kinds = OBSERVATION_KINDS[String(record.sourceTool ?? "")]
      ?? (record.subjectType === "artifact" ? ["artifact", "document"] : undefined);
    if (!kinds) return record;

    const matches = criteriaWithIds
      .filter((criterion) => {
        const kind = kindByCriterion.get(criterion.id);
        return kind !== undefined && kinds.includes(kind);
      })
      .filter((criterion) => reflectsCriterion(criterion.text, record).proves)
      .map((criterion) => criterion.id);

    return matches.length > 0
      ? { ...record, criterionIds: [...new Set([...(record.criterionIds ?? []), ...matches])] }
      : record;
  });
}

/* ------------------------------------------------------------------ *
 * Manual evidence review workflow
 * ------------------------------------------------------------------ */

export interface ManualEvidenceReview {
  reviewId: string;
  criterionId: string;
  requestedByAgentId?: string;
  reviewerAgentId?: string;
  evidence?: string;
  outcome?: "accepted" | "rejected";
  reason?: string;
  requestedAt: string;
  resolvedAt?: string;
}

function evidenceReviewEntries(
  journalStore: JournalStore,
  workItemId: string,
  kinds: JournalEntryKind[],
): WorkItemJournalEntryRecord[] {
  return journalStore
    .listForWorkItem(workItemId, { kinds, limit: 200 })
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function parseReview(entry: WorkItemJournalEntryRecord): ManualEvidenceReview {
  const metadata = entry.metadata as Record<string, unknown>;
  return {
    reviewId: String(metadata.reviewId ?? entry.id),
    criterionId: String(metadata.criterionId ?? ""),
    requestedByAgentId: typeof metadata.requestedByAgentId === "string" ? metadata.requestedByAgentId : undefined,
    reviewerAgentId: typeof metadata.reviewerAgentId === "string" ? metadata.reviewerAgentId : undefined,
    evidence: typeof metadata.evidence === "string" ? metadata.evidence : undefined,
    outcome: metadata.outcome === "accepted" || metadata.outcome === "rejected" ? metadata.outcome : undefined,
    reason: typeof metadata.reason === "string" ? metadata.reason : undefined,
    requestedAt: entry.occurredAt,
    resolvedAt: typeof metadata.resolvedAt === "string" ? metadata.resolvedAt : undefined,
  };
}

/**
 * Requests human review for criteria that cannot be automated.
 *
 * A request never counts as evidence by itself: closure stays blocked until the
 * review is resolved with an accepted outcome.
 */
export function requestManualEvidenceReview(
  journalStore: JournalStore,
  input: {
    projectId: string;
    workItemId: string;
    criterionId: string;
    requestedByAgentId?: string;
    reviewerAgentId?: string;
    reason: string;
    evidence?: string;
  },
): ManualEvidenceReview {
  const reviewId = `review-${input.criterionId}-${Date.now().toString(36)}`;
  journalStore.append({
    projectId: input.projectId,
    workItemId: input.workItemId,
    kind: "evidence_review_requested",
    fromAgentId: input.requestedByAgentId,
    toAgentId: input.reviewerAgentId,
    title: `Manual evidence review requested: ${input.criterionId}`,
    body: [input.reason, input.evidence ? `Evidence: ${bounded(input.evidence)}` : ""].filter(Boolean).join("\n\n"),
    refType: "work_item",
    refId: input.workItemId,
    metadata: {
      reviewId,
      criterionId: input.criterionId,
      requestedByAgentId: input.requestedByAgentId,
      reviewerAgentId: input.reviewerAgentId,
      evidence: bounded(input.evidence),
    },
  });
  return {
    reviewId,
    criterionId: input.criterionId,
    requestedByAgentId: input.requestedByAgentId,
    reviewerAgentId: input.reviewerAgentId,
    evidence: bounded(input.evidence),
    requestedAt: new Date().toISOString(),
  };
}

/**
 * Resolves a manual review with an accepted or rejected outcome.
 *
 * @throws Error when the review does not exist or is already resolved.
 */
export function resolveManualEvidenceReview(
  journalStore: JournalStore,
  input: {
    projectId: string;
    workItemId: string;
    reviewId: string;
    reviewerAgentId: string;
    outcome: "accepted" | "rejected";
    reason: string;
  },
): ManualEvidenceReview {
  const reviews = listManualEvidenceReviews(journalStore, input.workItemId);
  const review = reviews.find((candidate) => candidate.reviewId === input.reviewId);
  if (!review) throw new Error(`Manual evidence review not found: ${input.reviewId}`);
  if (review.outcome) throw new Error(`Manual evidence review is already ${review.outcome}.`);

  const resolvedAt = new Date().toISOString();
  journalStore.append({
    projectId: input.projectId,
    workItemId: input.workItemId,
    kind: "evidence_review_resolved",
    fromAgentId: input.reviewerAgentId,
    title: `Manual evidence review ${input.outcome}: ${review.criterionId}`,
    body: input.reason,
    refType: "work_item",
    refId: input.workItemId,
    metadata: {
      reviewId: review.reviewId,
      criterionId: review.criterionId,
      reviewerAgentId: input.reviewerAgentId,
      outcome: input.outcome,
      reason: input.reason,
      resolvedAt,
    },
  });

  return { ...review, outcome: input.outcome, reviewerAgentId: input.reviewerAgentId, reason: input.reason, resolvedAt };
}

/** Lists every manual evidence review with its current outcome. */
export function listManualEvidenceReviews(
  journalStore: JournalStore,
  workItemId: string,
): ManualEvidenceReview[] {
  const requested = evidenceReviewEntries(journalStore, workItemId, ["evidence_review_requested"]).map(parseReview);
  const resolved = evidenceReviewEntries(journalStore, workItemId, ["evidence_review_resolved"]).map(parseReview);
  const outcomeByReview = new Map(resolved.map((entry) => [entry.reviewId, entry]));
  return requested.map((entry) => {
    const outcome = outcomeByReview.get(entry.reviewId);
    return outcome ? { ...entry, ...outcome, requestedAt: entry.requestedAt } : entry;
  });
}

export interface ManualReviewStatus {
  pending: ManualEvidenceReview[];
  rejected: ManualEvidenceReview[];
  accepted: ManualEvidenceReview[];
}

export function summarizeManualReviews(
  journalStore: JournalStore | undefined,
  workItemId: string,
): ManualReviewStatus {
  const reviews = journalStore ? listManualEvidenceReviews(journalStore, workItemId) : [];
  return {
    pending: reviews.filter((review) => !review.outcome),
    rejected: reviews.filter((review) => review.outcome === "rejected"),
    accepted: reviews.filter((review) => review.outcome === "accepted"),
  };
}

/**
 * Turns accepted manual reviews into evidence records.
 *
 * A pending or rejected review produces no evidence, which keeps an
 * unresolvable human gate from closing as `done`.
 */
export function manualReviewEvidence(
  journalStore: JournalStore | undefined,
  workItemId: string,
): CriterionEvidenceRecord[] {
  const { accepted } = summarizeManualReviews(journalStore, workItemId);
  return accepted.map((review) => ({
    criterionId: review.criterionId,
    subjectType: "decision",
    format: "document",
    verificationMethod: "manual-review",
    subject: `manual review accepted for ${review.criterionId}`,
    passed: true,
    verified: true,
    sourceTool: "request_review",
    observedAt: review.resolvedAt ?? review.requestedAt,
    reference: review.reviewId,
    reviewedByAgentId: review.reviewerAgentId,
    output: bounded(review.reason),
  }));
}

