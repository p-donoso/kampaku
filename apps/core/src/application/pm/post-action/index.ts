/**
 * @module application/pm/post-action
 * Public API for the explicit post-action knowledge projection protocol.
 *
 * Guarantees:
 * - The original execution result is never overwritten; projections add records.
 * - Every projection is applied as a separate mutation and can retry alone.
 * - A wiki change is only ever proposed or commented, never claimed as published.
 * - A replayed event reuses one review per idempotency key.
 * - The private lesson channel is distinct from the superior journal.
 */
import type { AgentStore } from "../../../persistence/agent-store.js";
import type { JournalStore } from "../../../persistence/journal-store.js";
import type { MemoryStore } from "../../../persistence/memory-store.js";
import type { PmStore } from "../../../persistence/pm-store.js";
import { PostActionReviewStore, type PostActionReviewRecord } from "../../../persistence/post-action-store.js";
import type { Store } from "../../../persistence/store.js";
import type { WikiStore } from "../../../persistence/wiki-store.js";
import type { PostActionProjectionContext } from "./projections.js";
import { applyPostActionProjection } from "./projections.js";
import { runPostActionReviewCall, type PostActionReviewDelegate } from "./review.js";
import { buildDeterministicReview } from "./review.js";
import { validatePostActionReview } from "./validate.js";
import type { PostActionReviewResult } from "./types.js";
import {
  POST_ACTION_PROJECTIONS,
  type PostActionProjectionName,
  type PostActionReviewInput,
  type ProjectionOutcome,
} from "./types.js";

export * from "./types.js";
export {
  buildPostActionReviewPrompt,
  buildDeterministicReview,
  parseReviewJson,
  runPostActionReviewCall,
  POST_ACTION_REVIEW_SCHEMA,
  type PostActionReviewDelegate,
  type PostActionReviewOutcome,
} from "./review.js";
export { PostActionValidationError, validatePostActionReview } from "./validate.js";
export type { PostActionProjectionContext } from "./projections.js";
export {
  recordPostActionLifecycle,
  buildPostActionRuntime,
  type PostActionLifecycleEvent,
} from "./lifecycle.js";

export interface PostActionRuntime {
  pmStore: PmStore;
  agentStore: AgentStore;
  reviewStore: PostActionReviewStore;
  store?: Store;
  journalStore?: JournalStore;
  memoryStore?: MemoryStore;
  wikiStore?: WikiStore;
}

export interface RunPostActionReviewOptions {
  /** Model delegate. When absent the deterministic projection path is used. */
  delegate?: PostActionReviewDelegate;
  /** Retries per projection before the review is reported as partial or failed. */
  maxAttemptsPerProjection?: number;
}

const DEFAULT_MAX_ATTEMPTS = 2;

function resolveAgent(runtime: PostActionRuntime, agentSlug: string) {
  const agent = runtime.agentStore.getAgentBySlugOrId(agentSlug);
  if (!agent) throw new Error(`Agent not found: ${agentSlug}`);
  return agent;
}

/**
 * Normalizes the project reference so callers may pass a slug or a UUID.
 * Projections must always store the canonical project id.
 */
function normalizeInput(runtime: PostActionRuntime, input: PostActionReviewInput): PostActionReviewInput {
  const project = runtime.store?.getProject(input.projectId);
  return project ? { ...input, projectId: project.id } : input;
}

function buildProjectionContext(
  runtime: PostActionRuntime,
  agentId?: string,
): PostActionProjectionContext {
  return {
    pmStore: runtime.pmStore,
    agentStore: runtime.agentStore,
    store: runtime.store,
    journalStore: runtime.journalStore,
    memoryStore: runtime.memoryStore,
    wikiStore: runtime.wikiStore,
    reviewStore: runtime.reviewStore,
    agentId,
  };
}

/**
 * Runs a post-action review without a model call, using recorded facts only.
 *
 * Used by automated lifecycle hooks, which must never block on a provider.
 */
export function runPostActionReviewSync(
  runtime: PostActionRuntime,
  rawInput: PostActionReviewInput,
  options: { maxAttemptsPerProjection?: number } = {},
): PostActionReviewRecord {
  const input = normalizeInput(runtime, rawInput);
  const agent = resolveAgent(runtime, input.agentSlug);
  const idempotencyKey = PostActionReviewStore.buildIdempotencyKey({
    event: input.event,
    agentId: agent.id,
    projectId: input.projectId,
    referenceId: input.referenceId,
    workItemId: input.workItemId,
  });

  const existing = runtime.reviewStore.findByKey(idempotencyKey);
  if (existing) return existing;

  const result = validatePostActionReview(buildDeterministicReview(input), input);
  const review = runtime.reviewStore.create({
    event: input.event,
    agentId: agent.id,
    agentSlug: input.agentSlug,
    projectId: input.projectId,
    workItemId: input.workItemId,
    referenceId: input.referenceId,
    idempotencyKey,
    source: "deterministic",
    input,
    result,
    projections: [],
  });

  const projections = applyAllProjections(
    runtime,
    review.id,
    input,
    result,
    agent.id,
    options.maxAttemptsPerProjection ?? DEFAULT_MAX_ATTEMPTS,
  );

  return runtime.reviewStore.updateProjections(review.id, projections);
}

/**
 * Runs a post-action review for a meaningful lifecycle event.
 *
 * @param runtime - Stores the projections may mutate.
 * @param input - Recorded facts for the event.
 * @param options - Optional model delegate and retry budget.
 * @returns The persisted review record with per-projection outcomes.
 */
export async function runPostActionReview(
  runtime: PostActionRuntime,
  rawInput: PostActionReviewInput,
  options: RunPostActionReviewOptions = {},
): Promise<PostActionReviewRecord> {
  const input = normalizeInput(runtime, rawInput);
  const agent = resolveAgent(runtime, input.agentSlug);
  const idempotencyKey = PostActionReviewStore.buildIdempotencyKey({
    event: input.event,
    agentId: agent.id,
    projectId: input.projectId,
    referenceId: input.referenceId,
    workItemId: input.workItemId,
  });

  const existing = runtime.reviewStore.findByKey(idempotencyKey);
  if (existing) return existing;

  const outcome = await runPostActionReviewCall(input, { delegate: options.delegate });
  const review = runtime.reviewStore.create({
    event: input.event,
    agentId: agent.id,
    agentSlug: input.agentSlug,
    projectId: input.projectId,
    workItemId: input.workItemId,
    referenceId: input.referenceId,
    idempotencyKey,
    source: outcome.source,
    input,
    result: outcome.result,
    projections: [],
  });

  const projections = applyAllProjections(
    runtime,
    review.id,
    input,
    outcome.result,
    agent.id,
    options.maxAttemptsPerProjection ?? DEFAULT_MAX_ATTEMPTS,
  );

  return runtime.reviewStore.updateProjections(review.id, projections);
}

/**
 * Applies every projection for a review, retrying each one independently.
 */
export function applyAllProjections(
  runtime: PostActionRuntime,
  reviewId: string,
  input: PostActionReviewInput,
  result: PostActionReviewResult,
  agentId: string | undefined,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): ProjectionOutcome[] {
  const ctx = buildProjectionContext(runtime, agentId);
  const outcomes: ProjectionOutcome[] = [];

  for (const name of POST_ACTION_PROJECTIONS) {
    let outcome: ProjectionOutcome = { name, status: "failed", attempts: 0 };
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      try {
        outcome = {
          ...applyPostActionProjection(name, ctx, {
            reviewId,
            event: input.event,
            agentSlug: input.agentSlug,
            result,
            target: {
              projectId: input.projectId,
              workItemId: input.workItemId,
              referenceId: input.referenceId,
            },
          }),
          attempts: attempt,
        };
      } catch (error) {
        outcome = {
          name,
          status: "failed",
          attempts: attempt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (outcome.status !== "failed") break;
    }
    outcomes.push(outcome);
  }

  return outcomes;
}

/**
 * Retries a single projection of an existing review without re-running the work.
 */
export function retryPostActionProjection(
  runtime: PostActionRuntime,
  reviewId: string,
  projection: PostActionProjectionName,
): PostActionReviewRecord {
  const review = runtime.reviewStore.getById(reviewId);
  if (!review) throw new Error(`Post-action review not found: ${reviewId}`);

  const ctx = buildProjectionContext(runtime, review.agentId);
  let outcome: ProjectionOutcome = { name: projection, status: "failed", attempts: 0 };
  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    try {
      outcome = {
        ...applyPostActionProjection(projection, ctx, {
          reviewId: review.id,
          event: review.event,
          agentSlug: review.agentSlug,
          result: review.result,
          target: {
            projectId: review.projectId,
            workItemId: review.workItemId,
            referenceId: review.referenceId,
          },
        }),
        attempts: attempt,
      };
    } catch (error) {
      outcome = {
        name: projection,
        status: "failed",
        attempts: attempt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (outcome.status !== "failed") break;
  }

  const projections = review.projections
    .filter((entry) => entry.name !== projection)
    .concat(outcome)
    .sort(
      (a, b) =>
        POST_ACTION_PROJECTIONS.indexOf(a.name) - POST_ACTION_PROJECTIONS.indexOf(b.name),
    );

  return runtime.reviewStore.updateProjections(review.id, projections);
}

export interface PostActionClosureReport {
  reviews: number;
  latestStatus: string | null;
  journalPresent: boolean;
  privateMemoryPresent: boolean;
  wikiState: "not_needed" | "proposed" | "commented" | "missing";
  wikiBlocking: boolean;
  missing: string[];
}

/**
 * Reports closure evidence per channel so a missing journal, private lesson, or
 * required wiki synchronization is named separately.
 */
export function evaluatePostActionClosure(
  runtime: PostActionRuntime,
  options: { projectId: string; agentSlug: string; wikiSyncRequired?: boolean },
): PostActionClosureReport {
  const projectId = runtime.store?.getProject(options.projectId)?.id ?? options.projectId;
  const reviews = runtime.reviewStore.listByProject(projectId, 50);
  const latest = reviews[0];
  const journalPresent =
    latest?.projections.find((projection) => projection.name === "journal")?.status === "applied";
  const memoryOutcome = latest?.projections.find((projection) => projection.name === "memory");
  const privateMemoryPresent = memoryOutcome?.status === "applied";
  const wikiOutcome = latest?.projections.find((projection) => projection.name === "wiki");

  let wikiState: PostActionClosureReport["wikiState"] = "missing";
  if (wikiOutcome?.status === "skipped") wikiState = "not_needed";
  else if (wikiOutcome?.status === "applied") {
    wikiState = wikiOutcome.pendingApproval ? "proposed" : "commented";
  }

  const missing: string[] = [];
  if (!latest) missing.push("post_action_review");
  if (latest && !journalPresent) missing.push("journal_projection");
  if (latest && privateMemoryPresent === false && memoryOutcome?.status === "failed") {
    missing.push("private_memory_projection");
  }
  // A project that requires wiki synchronization is only satisfied by a
  // publication, a pending proposal, or a comment. An explicit not_needed still
  // leaves the required synchronization unmet, so it stays blocking.
  const wikiSatisfied = wikiState === "proposed" || wikiState === "commented";
  const wikiBlocking = options.wikiSyncRequired === true && !wikiSatisfied;
  if (wikiBlocking) missing.push("wiki_projection");

  return {
    reviews: reviews.length,
    latestStatus: latest?.status ?? null,
    journalPresent: journalPresent === true,
    privateMemoryPresent,
    wikiState,
    wikiBlocking,
    missing,
  };
}

export type { PostActionReviewRecord };
