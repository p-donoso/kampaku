/**
 * @module application/pm/manual-evidence-gate
 *
 * The missing half of the manual-evidence workflow: the product knew how to **record** a human decision
 * about an acceptance criterion and never asked for one.
 *
 * Why this module exists. `evidence-review.ts` has a complete manual-review model — a request journal
 * entry, a resolve entry, and `manualReviewEvidence` turning an accepted review into an evidence record —
 * and nothing in the product called either end of it. Measured 2026-09-30 on suite 08's fourth run: the
 * leaf's criteria were routed by the plan to `request_review` (some genuinely a judgement, some a command
 * the router did not recognise), the worker finished with the checks and both files it wrote observed, and
 * the closure gate refused the item with *"Acceptance criteria without evidence: ac-4."* The operator was
 * shown no gate, because none was opened, and the only evidence that could satisfy the criterion was one
 * no surface could produce (BOARD F-082). A criterion that needs a person is not a defect; asking nobody
 * for it is, and it deadlocks the leaf: `blocked` is retryable, so the failure mode was to run the same job
 * again and be refused in the same way.
 *
 * What this does. When a job that did its work is refused **only because a human decision is missing**, the
 * item is turned into a request the operator can actually answer: a review is recorded in the journal and a
 * required single-choice question reaches the emperor, with the criterion quoted. The answer is the
 * decision — accepted closes it, rejected keeps it blocked and says so — and no tool observation can
 * produce either, which is the property that makes a judgement a judgement.
 *
 * Two deliberate limits:
 *
 * - Only criteria the plan's own router sends to `request_review` are gated. A criterion routed to a tool
 *   is decided by that tool; offering a person the option to accept it would let a gate pass over a failed
 *   check.
 * - One gate per criterion per work item, ever. The question id is derived from both, and `askEmperor`
 *   refuses to mint a second gate for an id it already recorded, so a job that is retried four times raises
 *   one decision, not four (the defect [F-049] recorded for restated questions).
 */

import type { AgentQuestionRecord, QuestionStore } from "../../persistence/question-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";
import { parseCriterionChecks } from "./criterion-checks.js";
import {
  listManualEvidenceReviews,
  requestManualEvidenceReview,
  resolveManualEvidenceReview,
  summarizeManualReviews,
  type ManualEvidenceReview,
} from "./evidence-review.js";
import { identifyAcceptanceCriteria } from "./acceptance-criteria.js";
import { KAMPAKU_AGENT_ID } from "../../agents/definitions.js";

/** Marker that makes a gate recognisably ours when its answer comes back. */
const QUESTION_ID_PREFIX = "manual-evidence";

/** The two decisions a criterion gate offers, as the operator's own words. */
export const ACCEPT_OPTION = "Accepted — the criterion is met";
export const REJECT_OPTION = "Rejected — the criterion is not met";

export interface ManualCriterionRef {
  criterionId: string;
  text: string;
}

/**
 * The question id a criterion's gate carries.
 *
 * Stable across retries of the same leaf, and unique per criterion, because it is what makes the gate
 * idempotent: `askEmperor` returns the existing record for an id it has already seen, so a leaf that is
 * retried four times raises one decision rather than four.
 */
export function manualEvidenceQuestionId(workItemId: string, criterionId: string): string {
  return `${QUESTION_ID_PREFIX}:${workItemId}:${criterionId}`;
}

/**
 * The criteria of a work item that need a human decision and have none yet.
 *
 * A criterion is included when the plan's router sends it to `request_review` (so no tool can decide it)
 * and no review of any outcome is on record for it. A criterion already reviewed is left alone, including
 * a rejected one: re-asking a decision the operator has taken is the loop [F-049] is about, and a
 * rejection has to be visible as a rejection — see `manualEvidenceBlockDetail`.
 */
export function manualCriteriaAwaitingDecision(
  workItem: Pick<WorkItemRecord, "id" | "acceptanceCriteria">,
  journalStore?: JournalStore,
): ManualCriterionRef[] {
  const criteria = identifyAcceptanceCriteria(workItem.acceptanceCriteria ?? []);
  if (criteria.length === 0) return [];

  const manual = parseCriterionChecks(criteria).filter((check) => check.kind === "manual");
  if (manual.length === 0) return [];

  const reviewed = new Set(
    (journalStore ? listManualEvidenceReviews(journalStore, workItem.id) : []).map(
      (review) => review.criterionId,
    ),
  );

  return manual
    .filter((check) => !reviewed.has(check.criterionId))
    .map((check) => ({ criterionId: check.criterionId, text: check.instruction }));
}

/**
 * A sentence naming every decision that is still open or was refused, for the block the operator reads.
 *
 * A rejected review is a state the product has to be able to say out loud. Without this, a rejected
 * criterion produces the same `blocked` status as an unsatisfied one and the reason for the refusal is
 * only in the journal.
 */
export function manualEvidenceBlockDetail(
  journalStore: JournalStore | undefined,
  workItemId: string,
): string | undefined {
  if (!journalStore) return undefined;
  const { pending, rejected } = summarizeManualReviews(journalStore, workItemId);
  const parts: string[] = [];
  if (pending.length > 0) {
    parts.push(
      `awaiting the emperor's decision on ${pending.map((review) => review.criterionId).join(", ")}`,
    );
  }
  if (rejected.length > 0) {
    parts.push(
      `rejected by the emperor: ${rejected
        .map((review) => `${review.criterionId} (${review.reason ?? "no reason recorded"})`)
        .join("; ")}`,
    );
  }
  return parts.length > 0 ? ` Manual evidence ${parts.join("; ")}.` : undefined;
}

export interface OpenManualGatesInput {
  workItem: WorkItemRecord;
  journalStore?: JournalStore;
  questionStore?: QuestionStore;
  /** The seat the work belongs to; the gate is raised from it, as the item's own owner would. */
  askedByAgentId: string;
  /** Why the closure gate refused, quoted in the gate so the operator sees the refusal it answers. */
  reason?: string;
}

export interface OpenManualGatesResult {
  criteria: string[];
  reviews: ManualEvidenceReview[];
  /** Every gate that is open for this work item, asked or already waiting. */
  questions: AgentQuestionRecord[];
  /** How many of them were asked by this call. */
  questionsCreated: number;
}

/**
 * Records a review and raises one required question for every criterion that needs a decision.
 *
 * The question is addressed to the emperor through the same store every other human gate uses, so it is
 * answerable in the web UI and from the CLI with no new surface — which is also what makes it a gate the
 * operator can actually close. Nothing here closes anything: an unanswered or rejected decision leaves the
 * item blocked, and `manualReviewEvidence` produces no evidence for either.
 */
/**
 * Opens the review **and the question** for one criterion that needs a human decision.
 *
 * Extracted so that the two callers — a job's refusal (`openManualEvidenceGates`, which asks about every
 * criterion that needs one) and an operator deciding a given criterion (`closure-discharge`) — raise the
 * *same* gate, with the same id and the same wording. Two askers would mean two ids for one decision, and
 * an answer to one of them would leave the other pending forever (BOARD F-088's second finding).
 *
 * Idempotent in both halves: `requestManualEvidenceReview` is only called when no review exists for the
 * criterion, and `askEmperor` returns the existing record for a question id it has already seen.
 */
export function openManualEvidenceGateForCriterion(input: {
  workItem: Pick<WorkItemRecord, "id" | "projectId" | "title">;
  criterion: ManualCriterionRef;
  journalStore: JournalStore;
  questionStore?: QuestionStore;
  askedByAgentId: string;
  /** Why the leaf is blocked, quoted in the gate so the operator sees the refusal it answers. */
  reason?: string;
}): { review: ManualEvidenceReview; question?: AgentQuestionRecord; questionCreated: boolean } {
  const { workItem, criterion } = input;
  const existing = listManualEvidenceReviews(input.journalStore, workItem.id).find(
    (review) => review.criterionId === criterion.criterionId,
  );
  const review =
    existing ??
    requestManualEvidenceReview(input.journalStore, {
      projectId: workItem.projectId,
      workItemId: workItem.id,
      criterionId: criterion.criterionId,
      requestedByAgentId: input.askedByAgentId,
      reviewerAgentId: KAMPAKU_AGENT_ID,
      reason:
        input.reason ??
        `No tool can decide "${criterion.text}"; the emperor's decision is what closes it.`,
      evidence: criterion.text,
    });

  if (!input.questionStore) return { review, questionCreated: false };

  const questionId = manualEvidenceQuestionId(workItem.id, criterion.criterionId);
  const tagged =
    "<kampaku-question>" +
    JSON.stringify({
      id: questionId,
      type: "single_choice",
      prompt: `Acceptance criterion ${criterion.criterionId} of "${workItem.title}" cannot be decided by any tool. Is it met?`,
      options: [ACCEPT_OPTION, REJECT_OPTION],
      required: true,
    }) +
    "</kampaku-question>";

  const { question, created } = input.questionStore.askEmperor({
    askedByAgentId: input.askedByAgentId,
    question: tagged,
    questionId,
    projectId: workItem.projectId,
    workItemId: workItem.id,
    context: [
      `**Criterion ${criterion.criterionId}** — ${criterion.text}`,
      input.reason ? `The closure gate refused the work with: *${input.reason}*` : "",
      "A tool cannot witness this criterion, so the decision is the evidence. Accepting it records the "
        + "emperor's decision against the criterion and lets the leaf close; rejecting it keeps the leaf "
        + "blocked and is reported as a rejection, never as missing evidence.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return { review, question, questionCreated: created };
}

export function openManualEvidenceGates(input: OpenManualGatesInput): OpenManualGatesResult {
  const empty: OpenManualGatesResult = { criteria: [], reviews: [], questions: [], questionsCreated: 0 };
  const criteria = manualCriteriaAwaitingDecision(input.workItem, input.journalStore);
  if (criteria.length === 0 || !input.journalStore) return empty;

  const reviews = criteria.map(
    (criterion) =>
      openManualEvidenceGateForCriterion({
        workItem: input.workItem,
        criterion,
        journalStore: input.journalStore as JournalStore,
        askedByAgentId: input.askedByAgentId,
        reason: input.reason,
      }).review,
  );

  if (!input.questionStore) {
    return { criteria: criteria.map((c) => c.criterionId), reviews, questions: [], questionsCreated: 0 };
  }

  // One question per criterion, and every criterion gets one.
  //
  // Asking only about the first one looked tidier and was wrong: the first pass opened a review for *both*
  // an undecidable criterion and the next one, asked about the first, and then — because the second already
  // had a review — never asked about it at all. Measured 2026-09-30 on suite 08's fifth run: the operator
  // accepted `ac-3` through the web UI, the decision was recorded as `evidence_review_resolved: ac-3`, and
  // the leaf stayed blocked with **no question anywhere** for `ac-5`. A review nobody is asked about is the
  // same deadlock this module exists to remove, one criterion further along.
  const questions: AgentQuestionRecord[] = [];
  let questionsCreated = 0;
  for (const criterion of criteria) {
    const opened = openManualEvidenceGateForCriterion({
      workItem: input.workItem,
      criterion,
      journalStore: input.journalStore,
      questionStore: input.questionStore,
      askedByAgentId: input.askedByAgentId,
      reason: input.reason,
    });
    if (opened.question) questions.push(opened.question);
    if (opened.questionCreated) questionsCreated += 1;
  }

  return {
    criteria: criteria.map((criterion) => criterion.criterionId),
    reviews,
    questions,
    questionsCreated,
  };
}

/**
 * The work item and criterion a manual-evidence gate is about, read back out of the answered question.
 *
 * The reading is the inverse of the id `manualEvidenceQuestionId` writes, and it is what lets an answer
 * from any surface — the web card, the CLI, the HTTP route — resolve the review it was raised for without
 * a second store.
 */
export function parseManualEvidenceQuestion(
  questionText: string,
): { workItemId: string; criterionId: string } | undefined {
  const match = questionText.match(
    new RegExp(`"id"\\s*:\\s*"${QUESTION_ID_PREFIX}:([^:"]+):([^"]+)"`),
  );
  if (!match) return undefined;
  return { workItemId: match[1], criterionId: match[2] };
}

/**
 * Whether an answer to a criterion gate accepted it.
 *
 * Read from the operator's own words, because a decision the product infers from anything else is not a
 * decision. The gate offers the two options; an answer that matches neither — a free-text note in the
 * CLI — is read as an acceptance only when it does not refuse, and the text itself is recorded as the
 * reason either way.
 */
export function answerAcceptsCriterion(answer: string): boolean {
  const text = answer.trim();
  if (!text) return false;
  if (/^reject/i.test(text)) return false;
  if (/^accept/i.test(text)) return true;
  return !/\bnot met\b|\breject(?:ed)?\b|\bfalse\b/i.test(text);
}

export interface ResolveFromAnswerInput {
  journalStore?: JournalStore;
  questionText: string;
  answer: string;
  answeredByAgentId?: string;
  /** Used when the question record carries no work item, for example an answer routed by id alone. */
  workItemId?: string;
}

/**
 * Turns an answer to a criterion gate into a recorded human decision.
 *
 * Returns the reviews it resolved, so a caller knows whether the answer changed anything — an accepted
 * review is evidence that can close a leaf, and the caller is expected to re-evaluate closure once it has
 * been recorded rather than spend another job on the same work.
 */
export function resolveManualEvidenceFromAnswer(
  input: ResolveFromAnswerInput,
): ManualEvidenceReview[] {
  if (!input.journalStore) return [];
  const parsed = parseManualEvidenceQuestion(input.questionText);
  const workItemId = parsed?.workItemId ?? input.workItemId;
  if (!parsed || !workItemId) return [];

  const review = listManualEvidenceReviews(input.journalStore, workItemId).find(
    (candidate) => candidate.criterionId === parsed.criterionId && !candidate.outcome,
  );
  if (!review) return [];

  const projectId = reviewProjectId(input.journalStore, workItemId);
  if (!projectId) return [];

  const resolved = resolveManualEvidenceReview(input.journalStore, {
    projectId,
    workItemId,
    reviewId: review.reviewId,
    reviewerAgentId: input.answeredByAgentId ?? KAMPAKU_AGENT_ID,
    outcome: answerAcceptsCriterion(input.answer) ? "accepted" : "rejected",
    reason: input.answer.trim() || "Decision recorded without a note.",
  });
  return [resolved];
}

/** The project a work item belongs to, resolved from the journal entry that carried the request. */
function reviewProjectId(journalStore: JournalStore, workItemId: string): string | undefined {
  const [entry] = journalStore.listForWorkItem(workItemId, {
    kinds: ["evidence_review_requested"],
    limit: 1,
  });
  return entry?.projectId;
}
