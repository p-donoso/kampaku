/**
 * @module application/pm/post-action/lifecycle
 * Lifecycle adapters that turn recorded events into post-action reviews.
 *
 * Every adapter is best-effort by design: a projection failure must never
 * corrupt or roll back the action that already happened. Failures are surfaced
 * as projection statuses on the stored review, not as thrown errors.
 */
import type { AgentStore } from "../../../persistence/agent-store.js";
import type { JournalStore } from "../../../persistence/journal-store.js";
import type { MemoryStore } from "../../../persistence/memory-store.js";
import type { PmStore } from "../../../persistence/pm-store.js";
import type { PostActionReviewRecord, PostActionReviewStore } from "../../../persistence/post-action-store.js";
import type { Store } from "../../../persistence/store.js";
import type { WikiStore } from "../../../persistence/wiki-store.js";
import type { PostActionEvent, PostActionReviewInput } from "./types.js";
import { runPostActionReviewSync, type PostActionRuntime } from "./index.js";

export interface PostActionLifecycleEvent {
  event: PostActionEvent;
  projectId: string;
  /** Agent responsible for the action. Falls back to the project lead, then the orchestrator. */
  agentSlug?: string;
  agentId?: string;
  workItemId?: string;
  referenceId?: string;
  summary: string;
  decisions?: string[];
  files?: string[];
  checks?: string[];
  acceptanceCriteria?: string[];
  followUps?: string[];
  wikiSyncRequired?: boolean;
  /** Pages the event touched. Overrides the project page list when provided. */
  wikiPages?: Array<{ slug: string; title: string; status: string }>;
}

/**
 * Builds a runtime from whatever stores a caller has.
 * Missing optional stores simply mark those projections as failed, never fabricated.
 */
export function buildPostActionRuntime(input: {
  pmStore: PmStore;
  agentStore: AgentStore;
  reviewStore?: PostActionReviewStore;
  store?: Store;
  journalStore?: JournalStore;
  memoryStore?: MemoryStore;
  wikiStore?: WikiStore;
}): PostActionRuntime | undefined {
  if (!input.reviewStore) return undefined;
  return {
    pmStore: input.pmStore,
    agentStore: input.agentStore,
    reviewStore: input.reviewStore,
    store: input.store,
    journalStore: input.journalStore,
    memoryStore: input.memoryStore,
    wikiStore: input.wikiStore,
  };
}

function resolveAgentSlug(runtime: PostActionRuntime, event: PostActionLifecycleEvent): string | undefined {
  if (event.agentSlug) return event.agentSlug;
  if (event.agentId) {
    const agent = runtime.agentStore.getAgentBySlugOrId(event.agentId);
    if (agent) return agent.slug;
  }
  const project = runtime.store?.getProject(event.projectId);
  if (project?.projectLeadAgentId) {
    const lead = runtime.agentStore.getAgentBySlugOrId(project.projectLeadAgentId);
    if (lead) return lead.slug;
  }
  return runtime.agentStore.getKampakuAgent()?.slug;
}

function describeWikiPages(runtime: PostActionRuntime, projectId: string) {
  if (!runtime.wikiStore) return undefined;
  const pages = runtime.wikiStore.listPagesByProject(projectId);
  if (pages.length === 0) return undefined;
  return pages
    .filter((page) => page.status !== "archived")
    .slice(0, 40)
    .map((page) => ({ slug: page.slug, title: page.title, status: page.status }));
}

/**
 * Records one lifecycle post-action review with the deterministic projection path.
 *
 * @returns The stored review, or undefined when no review store is wired or the
 *   event cannot produce a valid review. Never throws.
 */
export function recordPostActionLifecycle(
  runtime: PostActionRuntime | undefined,
  event: PostActionLifecycleEvent,
): PostActionReviewRecord | undefined {
  if (!runtime) return undefined;
  const agentSlug = resolveAgentSlug(runtime, event);
  if (!agentSlug) return undefined;

  const input: PostActionReviewInput = {
    event: event.event,
    agentSlug,
    projectId: event.projectId,
    workItemId: event.workItemId,
    referenceId: event.referenceId,
    summary: event.summary,
    decisions: event.decisions,
    files: event.files,
    checks: event.checks,
    acceptanceCriteria: event.acceptanceCriteria,
    followUps: event.followUps,
    wikiPages: event.wikiPages ?? describeWikiPages(runtime, event.projectId),
    wikiSyncRequired: event.wikiSyncRequired,
  };

  try {
    return runPostActionReviewSync(runtime, input);
  } catch {
    return undefined;
  }
}
