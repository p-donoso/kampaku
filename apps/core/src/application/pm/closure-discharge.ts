/**
 * @module application/pm/closure-discharge
 *
 * **The operator's path out of a blocked work item.** A refusal the operator cannot clear is a hands-off
 * stop, which is what suite 08 scores; this is the clearing, next to `kampaku risks mitigate|accept|escalate`
 * and for the same reason (BOARD F-084, which did this for a risk the gate stopped on, one layer out).
 *
 * Three shapes, and each answers a different kind of refusal (see `closure-refusal.ts` for which code gets
 * which):
 *
 * - **`decide`** — re-decide the closure against the job that already ran. No decision, no job, no cost. This
 *   is what an item blocked before the refusal was recorded needs, and what an item blocked by a rule that
 *   no longer fires needs; both are measured states of the `s08r9` specimen.
 * - **`peer-review`** — record the review the rule asked for. The operator is a legitimate reviewer, and the
 *   decision is recorded with their name on it (`--by`) and their reasoning (`--notes`), against the item's
 *   journal: the same shape the `submit_peer_review` tool writes, so an approval is an approval whoever
 *   took it.
 * - **`criterion`** — decide one acceptance criterion no tool can witness, which becomes its evidence. This
 *   is the path `manual-evidence-gate` already runs for the criteria it chose to gate, reachable now for
 *   every criterion and from the CLI rather than only from the question card the product happened to raise.
 *
 * What it deliberately does **not** do: close the item. Every shape ends by re-running the closure decision,
 * so a refusal that is still standing stands, in its own words. And a decision that has no substance is
 * refused before anything is written — an acceptance with no note and no name is a status change, not a
 * decision (the rule `disposeRisk` enforces for risks).
 */

import type { JournalStore } from "../../persistence/journal-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { WorkItemStatus } from "../../persistence/pm-store.js";
import { identifyAcceptanceCriteria } from "./acceptance-criteria.js";
import {
  readLatestClosureRefusal,
  type ClosureRefusal,
} from "./closure-refusal.js";
import {
  listManualEvidenceReviews,
  requestManualEvidenceReview,
  resolveManualEvidenceReview,
} from "./evidence-review.js";
import {
  applyAnsweredManualEvidence,
  reevaluateBlockedWorkItemClosure,
  type ReconciliationContext,
} from "./execute-work-item.js";
import {
  ACCEPT_OPTION,
  REJECT_OPTION,
  openManualEvidenceGateForCriterion,
} from "./manual-evidence-gate.js";
import { KAMPAKU_AGENT_ID } from "../../agents/definitions.js";

/** Everything the discharge reads, plus where a criterion decision is asked. */
export type ClosureDischargeContext = ReconciliationContext & { questionStore?: QuestionStore };

export class ClosureDischargeError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" = "VALIDATION",
  ) {
    super(message);
    this.name = "ClosureDischargeError";
  }
}

export type ClosureDischarge =
  | { kind: "decide" }
  | { kind: "peer-review"; accept: boolean }
  | { kind: "criterion"; criterionId: string; accept: boolean };

export interface ClosureDischargeInput {
  workItemId: string;
  discharge: ClosureDischarge;
  /** Who takes the decision. Required for both decision shapes, and never inferred. */
  by?: string;
  /** The substance of the decision: what was checked, or why it passes. */
  notes?: string;
}

export interface ClosureDischargeResult {
  workItemId: string;
  workItemTitle: string;
  /** What the decision was, as it was recorded, or `"none"` for a bare re-decision. */
  recorded: string;
  /** Journal entry id of the recorded decision, when one was written. */
  recordedEntryId?: string;
  /** Where the item ended: `done` when the decision was the only thing missing. */
  status: WorkItemStatus;
  /** The refusal that still stands, when the decision did not clear the block. */
  refusal?: ClosureRefusal;
  /** The refusal as it read before the discharge, for the operator's record. */
  discharged?: ClosureRefusal;
  reason?: string;
}

function requireDecisionSubstance(input: ClosureDischargeInput): { by: string; notes: string } {
  const by = input.by?.trim() ?? "";
  const notes = input.notes?.trim() ?? "";
  if (!by) {
    throw new ClosureDischargeError(
      "Name who takes the decision: --by <who>. A closure decision with no author is a status change.",
    );
  }
  if (!notes) {
    throw new ClosureDischargeError(
      "A decision needs its substance: --notes <what was checked, or why it passes>. " +
        "Accepting with nothing behind it is a status change, not a decision.",
    );
  }
  return { by, notes };
}

/** Records the peer review the rule asked for, in the journal shape `submit_peer_review` writes. */
function recordPeerReview(
  journalStore: JournalStore,
  input: { projectId: string; workItemId: string; workItemTitle: string; by: string; notes: string; accept: boolean; rule: string },
): { entryId: string; summary: string } {
  const requested = journalStore.append({
    projectId: input.projectId,
    workItemId: input.workItemId,
    kind: "peer_review_requested",
    fromAgentId: KAMPAKU_AGENT_ID,
    toAgentId: KAMPAKU_AGENT_ID,
    title: `Peer review requested: ${input.workItemTitle}`,
    body: [
      `Scope: the closure rule that refused this work item — ${input.rule}`,
      `Reviewer: ${input.by} (the operator, reviewing in person).`,
    ].join("\n"),
    refType: "work_item",
    refId: input.workItemId,
    metadata: { status: "requested", reviewerBy: input.by },
  });
  const outcome = input.accept ? "approved" : "changes_requested";
  const updated = journalStore.append({
    projectId: input.projectId,
    workItemId: input.workItemId,
    kind: "peer_review_updated",
    fromAgentId: KAMPAKU_AGENT_ID,
    toAgentId: KAMPAKU_AGENT_ID,
    title: `Peer review ${outcome}: ${input.workItemTitle}`,
    body: `Findings: ${input.notes}\nReviewed by: ${input.by}`,
    refType: "work_item",
    refId: requested.id,
    metadata: {
      status: outcome,
      reviewId: requested.id,
      reviewerBy: input.by,
      notes: input.notes,
    },
  });
  return {
    entryId: updated.id,
    summary: `peer review ${outcome} by ${input.by} (journal entry ${updated.id})`,
  };
}

/** Records the operator's decision on one acceptance criterion, as the evidence for it. */
function recordCriterionDecision(
  journalStore: JournalStore,
  ctx: ClosureDischargeContext,
  input: {
    workItemId: string;
    criterionId: string;
    accept: boolean;
    by: string;
    notes: string;
  },
): {
  entryId: string;
  summary: string;
  /** The closure decision the answer already ran, so the caller does not decide twice. */
  outcome?: { status: WorkItemStatus; reason?: string; refusal?: ClosureRefusal };
} {
  const workItem = ctx.pmStore.getWorkItem(input.workItemId);
  if (!workItem) throw new ClosureDischargeError("Work item not found.", "NOT_FOUND");
  const criterion = identifyAcceptanceCriteria(workItem.acceptanceCriteria ?? []).find(
    (candidate) => candidate.id === input.criterionId,
  );
  if (!criterion) {
    throw new ClosureDischargeError(
      `This work item has no acceptance criterion "${input.criterionId}". Its criteria are: ` +
        identifyAcceptanceCriteria(workItem.acceptanceCriteria ?? [])
          .map((candidate) => candidate.id)
          .join(", "),
    );
  }

  const outcome = input.accept ? "accepted" : "rejected";
  const reviews = listManualEvidenceReviews(journalStore, input.workItemId).filter(
    (review) => review.criterionId === input.criterionId,
  );
  const latest = reviews.at(-1);
  if (
    reviews.every((review) => review.outcome) &&
    latest?.outcome === outcome &&
    (latest.reason ?? "").includes(input.notes)
  ) {
    throw new ClosureDischargeError(
      `Criterion ${input.criterionId} is already ${outcome} with that decision ` +
        `(review ${latest.reviewId}). No new decision was recorded.`,
    );
  }

  // With a question store, the decision is taken the way every other answer is taken: the gate is opened
  // (idempotent — an open gate is reused, not duplicated), the operator's answer is written to the question,
  // and `applyAnsweredManualEvidence` turns it into the review and re-decides the closure. Recording the
  // review directly would leave an open question nobody had answered behind, and the surface would go on
  // reporting it — measured while writing this: after a direct rejection the project still read
  // `pending_questions` for a gate that had been decided (BOARD F-088).
  if (ctx.questionStore) {
    const opened = openManualEvidenceGateForCriterion({
      workItem,
      criterion: { criterionId: criterion.id, text: criterion.text },
      journalStore,
      questionStore: ctx.questionStore,
      askedByAgentId: KAMPAKU_AGENT_ID,
      reason: readLatestClosureRefusal(journalStore, workItem.id)?.reason,
    });
    const question = opened.question;
    if (!question) throw new ClosureDischargeError("The criterion gate could not be opened.");
    const answer = `${input.accept ? ACCEPT_OPTION : REJECT_OPTION}\n\n${input.notes} (decided by ${input.by})`;
    // The question is only written to while it is open. A gate that was answered (or answered and then left
    // unresolved on a data dir rewound to before the answer) still holds the criterion's review, and the
    // review is what the decision has to land on.
    if (ctx.questionStore.list("pending").some((candidate) => candidate.id === question.id)) {
      ctx.questionStore.answer(question.id, answer, KAMPAKU_AGENT_ID);
    }
    const applied = applyAnsweredManualEvidence(
      { ...ctx, questionStore: ctx.questionStore },
      {
        questionText: question.question,
        answer,
        answeredByAgentId: KAMPAKU_AGENT_ID,
        workItemId: workItem.id,
      },
    );
    return {
      entryId: question.id,
      summary: `criterion ${input.criterionId} ${outcome} by ${input.by} (question ${question.id})`,
      outcome: {
        status: applied.workItemStatus ?? workItem.status,
        ...(applied.reason ? { reason: applied.reason } : {}),
        ...(applied.refusal ? { refusal: applied.refusal } : {}),
      },
    };
  }

  const pending = reviews.find((review) => !review.outcome);
  if (!pending) {
    // No review on record for this criterion — the closure rule refused it as evidence the job did not
    // produce, and the operator is deciding it now. `manual-evidence-gate` does the same thing for the
    // criteria it gates; this is that, on demand.
    requestManualEvidenceReview(journalStore, {
      projectId: workItem.projectId,
      workItemId: workItem.id,
      criterionId: input.criterionId,
      requestedByAgentId: KAMPAKU_AGENT_ID,
      reviewerAgentId: KAMPAKU_AGENT_ID,
      reason: `Decided by ${input.by} through kampaku projects closure.`,
      evidence: criterion.text,
    });
  }

  const unresolved = listManualEvidenceReviews(journalStore, workItem.id).find(
    (review) => review.criterionId === input.criterionId && !review.outcome,
  );
  if (!unresolved) {
    throw new ClosureDischargeError(`Criterion ${input.criterionId} has no open review to resolve.`);
  }
  const resolved = resolveManualEvidenceReview(journalStore, {
    projectId: workItem.projectId,
    workItemId: workItem.id,
    reviewId: unresolved.reviewId,
    reviewerAgentId: KAMPAKU_AGENT_ID,
    outcome,
    reason: `${input.notes} (decided by ${input.by})`,
  });
  return {
    entryId: resolved.reviewId,
    summary: `criterion ${input.criterionId} ${outcome} by ${input.by} (review ${resolved.reviewId})`,
  };
}

/**
 * Clears a closure refusal, then lets the closure decision decide whether that was enough.
 *
 * Returns the status the item ended in and the refusal that still stands, so the caller can report what the
 * decision did — the same contract `resumeWorkItemIfClear` and `disposeRisk` have, and the reason an
 * answer that did not close a leaf can now say *why* on the surface that took it.
 */
export function dischargeClosure(
  ctx: ClosureDischargeContext,
  input: ClosureDischargeInput,
): ClosureDischargeResult {
  const workItem = ctx.pmStore.getWorkItem(input.workItemId);
  if (!workItem) throw new ClosureDischargeError("Work item not found.", "NOT_FOUND");

  const discharged = readLatestClosureRefusal(ctx.journalStore, workItem.id);
  let recorded = "none";
  let recordedEntryId: string | undefined;
  // A criterion decision goes through the question store, which runs the closure decision itself
  // (`applyAnsweredManualEvidence`). Deciding it again would write the same refusal twice.
  let answeredOutcome: { status: WorkItemStatus; reason?: string; refusal?: ClosureRefusal } | undefined;

  if (input.discharge.kind !== "decide") {
    const { by, notes } = requireDecisionSubstance(input);
    const journalStore = ctx.journalStore;
    if (!journalStore) throw new ClosureDischargeError("The work-item journal is not available.");

    if (input.discharge.kind === "peer-review") {
      const decision = recordPeerReview(journalStore, {
        projectId: workItem.projectId,
        workItemId: workItem.id,
        workItemTitle: workItem.title,
        by,
        notes,
        accept: input.discharge.accept,
        rule: discharged?.reason ?? "the closure rule in force when this decision was taken",
      });
      recorded = decision.summary;
      recordedEntryId = decision.entryId;
    } else {
      const decision = recordCriterionDecision(journalStore, ctx, {
        workItemId: workItem.id,
        criterionId: input.discharge.criterionId,
        accept: input.discharge.accept,
        by,
        notes,
      });
      recorded = decision.summary;
      recordedEntryId = decision.entryId;
      answeredOutcome = decision.outcome;
    }
  }

  const outcome =
    answeredOutcome ??
    reevaluateBlockedWorkItemClosure(ctx, workItem.id) ?? { status: workItem.status };

  return {
    workItemId: workItem.id,
    workItemTitle: workItem.title,
    recorded,
    ...(recordedEntryId ? { recordedEntryId } : {}),
    status: outcome.status,
    ...(outcome.refusal ? { refusal: outcome.refusal } : {}),
    ...(discharged ? { discharged } : {}),
    ...(outcome.reason ? { reason: outcome.reason } : {}),
  };
}
