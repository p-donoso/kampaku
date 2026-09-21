/**
 * @module application/pm/post-action/projections
 * Applies each post-action projection as its own runtime mutation.
 *
 * Projections are deliberately independent: a failed wiki proposal must not
 * lose an already-applied journal entry, and a retry reapplies only the
 * projection that failed.
 */
import type { JournalStore } from "../../../persistence/journal-store.js";
import type { MemoryStore } from "../../../persistence/memory-store.js";
import type { PmStore } from "../../../persistence/pm-store.js";
import type { PostActionReviewStore } from "../../../persistence/post-action-store.js";
import type { Store } from "../../../persistence/store.js";
import type { WikiStore } from "../../../persistence/wiki-store.js";
import type { AgentStore } from "../../../persistence/agent-store.js";
import { postWikiComment, proposeWikiEdit } from "../../wiki/wiki.js";
import type { ProjectionOutcome, PostActionReviewResult } from "./types.js";

export interface PostActionProjectionContext {
  pmStore: PmStore;
  agentStore: AgentStore;
  store?: Store;
  journalStore?: JournalStore;
  memoryStore?: MemoryStore;
  wikiStore?: WikiStore;
  reviewStore: PostActionReviewStore;
  agentId?: string;
}

export interface PostActionProjectionTarget {
  projectId: string;
  workItemId?: string;
  referenceId?: string;
}

function renderJournalBody(result: PostActionReviewResult): string {
  const lines: string[] = [];
  const section = (title: string, values: string[]) => {
    if (values.length === 0) return;
    lines.push(`## ${title}`, ...values.map((value) => `- ${value}`), "");
  };
  lines.push("## Summary", result.journal.summary, "");
  section("Decisions", result.journal.decisions);
  section("Files", result.journal.files);
  section("Checks", result.journal.checks);
  section("Acceptance criteria", result.journal.acceptanceCriteria);
  section("Follow-ups", result.journal.followUps);
  lines.push("<!-- post-action-json");
  lines.push(
    JSON.stringify(
      {
        decisions: result.journal.decisions,
        files: result.journal.files,
        checks: result.journal.checks,
        acceptanceCriteria: result.journal.acceptanceCriteria,
        followUps: result.journal.followUps,
      },
      null,
      2,
    ),
  );
  lines.push("-->");
  return lines.join("\n");
}

function journalProjection(
  ctx: PostActionProjectionContext,
  reviewId: string,
  event: string,
  result: PostActionReviewResult,
  target: PostActionProjectionTarget,
): ProjectionOutcome {
  const base: ProjectionOutcome = { name: "journal", status: "failed", attempts: 1 };
  const existing = ctx.reviewStore.listProjectionJournalEntries(reviewId);
  if (existing[0]) {
    return { ...base, status: "applied", appliedRef: existing[0].id };
  }
  if (!ctx.journalStore) {
    return { ...base, error: "Journal store is not available." };
  }

  const workItemId = ctx.reviewStore.resolveWorkItemId(target.projectId, target.workItemId);
  if (!workItemId) {
    return { ...base, error: "No work item is available to anchor the journal projection." };
  }

  const entry = ctx.journalStore.append({
    projectId: target.projectId,
    workItemId,
    kind: "post_action",
    fromAgentId: ctx.agentId,
    toAgentId: ctx.pmStore.getWorkItem(workItemId)?.assignedByAgentId,
    title: `Post-action review: ${event.replace(/_/g, " ")}`,
    body: renderJournalBody(result),
    refType: "post_action_review",
    refId: reviewId,
    metadata: { event, referenceId: target.referenceId },
  });
  return { ...base, status: "applied", appliedRef: entry.id };
}

function memoryProjection(
  ctx: PostActionProjectionContext,
  reviewId: string,
  result: PostActionReviewResult,
  target: PostActionProjectionTarget,
): ProjectionOutcome {
  const base: ProjectionOutcome = { name: "memory", status: "failed", attempts: 1 };
  if (result.memory.notNeeded) {
    return { ...base, status: "skipped", notNeededReason: result.memory.reason };
  }
  const lesson = result.memory.lesson!;
  if (!ctx.memoryStore || !ctx.agentId) {
    return { ...base, error: "Private memory is unavailable for this agent." };
  }
  const duplicate = ctx.memoryStore
    .list({ agentId: ctx.agentId, kind: "learning", projectId: target.projectId, limit: 100 })
    .some((memory) => memory.metadata?.postActionReviewId === reviewId);
  if (duplicate) {
    return { ...base, status: "applied" };
  }
  const memory = ctx.memoryStore.create({
    agentId: ctx.agentId,
    kind: "learning",
    title: lesson.title,
    body: lesson.body,
    summary: lesson.summary,
    relevance: lesson.relevance,
    projectId: target.projectId,
    workItemId: target.workItemId,
    metadata: { source: "post_action_review", postActionReviewId: reviewId },
  });
  return { ...base, status: "applied", appliedRef: memory.id };
}

function wikiProjection(
  ctx: PostActionProjectionContext,
  result: PostActionReviewResult,
  target: PostActionProjectionTarget,
  agents: { slug: string },
): ProjectionOutcome {
  const base: ProjectionOutcome = { name: "wiki", status: "failed", attempts: 1 };
  const wiki = result.wiki;
  if (wiki.decision === "not_needed") {
    return { ...base, status: "skipped", notNeededReason: wiki.reason };
  }
  if (!ctx.wikiStore || !ctx.store) {
    return { ...base, error: "Shared wiki is not available in this runtime." };
  }
  if (!wiki.page) {
    return { ...base, error: "A wiki page slug is required for this wiki decision." };
  }

  if (wiki.decision === "propose_edit") {
    const page = proposeWikiEdit(
      ctx.store,
      ctx.wikiStore,
      ctx.agentStore,
      target.projectId,
      wiki.page,
      { agentSlug: agents.slug, contentMd: wiki.contentMd ?? "" },
    );
    return { ...base, status: "applied", appliedRef: page.id, pendingApproval: true };
  }

  const comment = postWikiComment(
    ctx.store,
    ctx.wikiStore,
    ctx.agentStore,
    target.projectId,
    wiki.page,
    { agentSlug: agents.slug, content: wiki.content ?? "" },
  );
  return { ...base, status: "applied", appliedRef: comment.id };
}

/**
 * Applies one projection. Callers own retry policy and status persistence.
 */
export function applyPostActionProjection(
  name: ProjectionOutcome["name"],
  ctx: PostActionProjectionContext,
  input: {
    reviewId: string;
    event: string;
    agentSlug: string;
    result: PostActionReviewResult;
    target: PostActionProjectionTarget;
  },
): ProjectionOutcome {
  switch (name) {
    case "journal":
      return journalProjection(ctx, input.reviewId, input.event, input.result, input.target);
    case "memory":
      return memoryProjection(ctx, input.reviewId, input.result, input.target);
    case "wiki":
      return wikiProjection(ctx, input.result, input.target, { slug: input.agentSlug });
    default:
      throw new Error(`Unknown post-action projection: ${String(name)}`);
  }
}
