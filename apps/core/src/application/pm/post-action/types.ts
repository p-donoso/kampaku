/**
 * @module application/pm/post-action/types
 * Vocabulary for the explicit post-action knowledge projection protocol.
 *
 * A post-action review is a second, low-context pass over a meaningful action
 * already taken by an agent. It never re-runs the action and never invents
 * content: every channel (superior journal, private memory, shared wiki) may
 * declare `not_needed`.
 */

/** Meaningful lifecycle events that trigger a post-action review. */
export const POST_ACTION_EVENTS = [
  "work_completed",
  "delegation_completed",
  "blocker_resolved",
  "handoff_completed",
  "work_failed",
  "phase_completed",
  "wiki_reviewed",
  "repo_changed",
] as const;

export type PostActionEvent = (typeof POST_ACTION_EVENTS)[number];

export function isPostActionEvent(value: unknown): value is PostActionEvent {
  return typeof value === "string" && (POST_ACTION_EVENTS as readonly string[]).includes(value);
}

/** Projections are applied as separate runtime mutations so each can retry alone. */
export const POST_ACTION_PROJECTIONS = ["journal", "memory", "wiki"] as const;
export type PostActionProjectionName = (typeof POST_ACTION_PROJECTIONS)[number];

export function isPostActionProjectionName(value: unknown): value is PostActionProjectionName {
  return typeof value === "string" && (POST_ACTION_PROJECTIONS as readonly string[]).includes(value);
}

export type ProjectionStatus = "applied" | "skipped" | "failed";

export interface ProjectionOutcome {
  name: PostActionProjectionName;
  status: ProjectionStatus;
  attempts: number;
  /** Mutation reference, for example a journal entry id or a wiki page id. */
  appliedRef?: string;
  /** Populated only when status is `failed`. */
  error?: string;
  /** Set when the review explicitly declined the channel. */
  notNeededReason?: string;
  /** True when the wiki channel produced a proposal or comment instead of a publication. */
  pendingApproval?: boolean;
}

export interface PostActionJournalProjection {
  summary: string;
  decisions: string[];
  files: string[];
  checks: string[];
  acceptanceCriteria: string[];
  followUps: string[];
}

export interface PostActionMemoryProjection {
  notNeeded: boolean;
  reason?: string;
  lesson?: {
    title: string;
    body: string;
    summary?: string;
    relevance?: number;
  };
}

export type PostActionWikiDecision = "not_needed" | "propose_edit" | "post_comment";

export interface PostActionWikiProjection {
  decision: PostActionWikiDecision;
  reason: string;
  page?: string;
  evidence?: string;
  contentMd?: string;
  content?: string;
}

export interface PostActionReviewResult {
  journal: PostActionJournalProjection;
  memory: PostActionMemoryProjection;
  wiki: PostActionWikiProjection;
}

/** Evidence the review is allowed to read. Nothing else is passed to the model. */
export interface PostActionReviewInput {
  event: PostActionEvent;
  agentSlug: string;
  projectId: string;
  workItemId?: string;
  /** Event-specific reference id: job, blocker, question, handoff, plan, or page. */
  referenceId?: string;
  /** Execution result, files, decisions, checks, criteria, and follow-ups as recorded. */
  summary: string;
  decisions?: string[];
  files?: string[];
  checks?: string[];
  acceptanceCriteria?: string[];
  followUps?: string[];
  /** Current state of the affected wiki pages, when the event touched shared knowledge. */
  wikiPages?: Array<{ slug: string; title: string; status: string }>;
  /** Required project metadata, for example whether wiki sync blocks closure. */
  wikiSyncRequired?: boolean;
}
