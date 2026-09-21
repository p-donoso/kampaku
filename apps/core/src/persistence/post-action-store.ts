import { and, desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import { postActionReviews, workItemJournalEntries } from "./schema.js";
import type { WorkItemJournalEntryRecord } from "./journal-store.js";
import type { PmStore } from "./pm-store.js";
import type {
  PostActionEvent,
  PostActionReviewInput,
  PostActionReviewResult,
  ProjectionOutcome,
} from "../application/pm/post-action/types.js";

export type PostActionReviewStatus = "pending" | "completed" | "partial" | "failed";

export interface PostActionReviewRecord {
  id: string;
  event: PostActionEvent;
  agentId?: string;
  agentSlug: string;
  projectId: string;
  workItemId?: string;
  referenceId?: string;
  idempotencyKey: string;
  source: "model" | "deterministic";
  status: PostActionReviewStatus;
  input: PostActionReviewInput;
  result: PostActionReviewResult;
  projections: ProjectionOutcome[];
  createdAt: string;
  updatedAt: string;
}

export class PostActionReviewStore extends BaseStore {
  constructor(
    db: Db,
    private readonly pmStore: PmStore,
  ) {
    super(db);
  }

  /**
   * Builds the deduplication key for an event so replayed job results reuse one
   * review instead of fabricating duplicate projections.
   */
  static buildIdempotencyKey(input: {
    event: PostActionEvent;
    agentId?: string;
    projectId: string;
    referenceId?: string;
    workItemId?: string;
  }): string {
    return [
      input.event,
      input.projectId,
      input.workItemId ?? "-",
      input.referenceId ?? "-",
      input.agentId ?? "-",
    ].join(":");
  }

  findByKey(idempotencyKey: string): PostActionReviewRecord | undefined {
    const row = this.db
      .select()
      .from(postActionReviews)
      .where(eq(postActionReviews.idempotencyKey, idempotencyKey))
      .get();
    return row ? this.mapRow(row) : undefined;
  }

  getById(id: string): PostActionReviewRecord | undefined {
    const row = this.db.select().from(postActionReviews).where(eq(postActionReviews.id, id)).get();
    return row ? this.mapRow(row) : undefined;
  }

  create(input: {
    event: PostActionEvent;
    agentId?: string;
    agentSlug: string;
    projectId: string;
    workItemId?: string;
    referenceId?: string;
    idempotencyKey: string;
    source: "model" | "deterministic";
    input: PostActionReviewInput;
    result: PostActionReviewResult;
    projections: ProjectionOutcome[];
  }): PostActionReviewRecord {
    const now = new Date().toISOString();
    const record: PostActionReviewRecord = {
      id: uuidv4(),
      event: input.event,
      agentId: input.agentId,
      agentSlug: input.agentSlug,
      projectId: input.projectId,
      workItemId: input.workItemId,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      source: input.source,
      status: summarizeStatus(input.projections),
      input: input.input,
      result: input.result,
      projections: input.projections,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .insert(postActionReviews)
      .values({
        id: record.id,
        event: record.event,
        agentId: record.agentId ?? null,
        agentSlug: record.agentSlug,
        projectId: record.projectId,
        workItemId: record.workItemId ?? null,
        referenceId: record.referenceId ?? null,
        idempotencyKey: record.idempotencyKey,
        source: record.source,
        status: record.status,
        inputJson: JSON.stringify(record.input),
        resultJson: JSON.stringify(record.result),
        projectionsJson: JSON.stringify(record.projections),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      .run();

    return record;
  }

  updateProjections(id: string, projections: ProjectionOutcome[]): PostActionReviewRecord {
    const existing = this.getById(id);
    if (!existing) throw new Error(`Post-action review not found: ${id}`);
    const updatedAt = new Date().toISOString();
    this.db
      .update(postActionReviews)
      .set({
        projectionsJson: JSON.stringify(projections),
        status: summarizeStatus(projections),
        updatedAt,
      })
      .where(eq(postActionReviews.id, id))
      .run();
    return { ...existing, projections, status: summarizeStatus(projections), updatedAt };
  }

  listByProject(projectId: string, limit = 20): PostActionReviewRecord[] {
    const rows = this.db
      .select()
      .from(postActionReviews)
      .where(eq(postActionReviews.projectId, projectId))
      .orderBy(desc(postActionReviews.createdAt))
      .limit(Math.max(1, Math.min(limit, 100)))
      .all();
    return rows.map((row) => this.mapRow(row));
  }

  /** Journal entries this review created, used for idempotent retries. */
  listProjectionJournalEntries(reviewId: string): WorkItemJournalEntryRecord[] {
    const rows = this.db
      .select()
      .from(workItemJournalEntries)
      .where(
        and(
          eq(workItemJournalEntries.refType, "post_action_review"),
          eq(workItemJournalEntries.refId, reviewId),
        ),
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      workItemId: row.workItemId,
      anchorWorkItemId: row.anchorWorkItemId,
      kind: row.kind as WorkItemJournalEntryRecord["kind"],
      fromAgentId: row.fromAgentId ?? undefined,
      toAgentId: row.toAgentId ?? undefined,
      title: row.title,
      body: row.body,
      refType: (row.refType as WorkItemJournalEntryRecord["refType"]) ?? undefined,
      refId: row.refId ?? undefined,
      metadata: row.metadataJson ? (JSON.parse(row.metadataJson) as Record<string, unknown>) : {},
      occurredAt: row.occurredAt,
    }));
  }

  /** Resolves the anchor work item a projection should attach to. */
  resolveWorkItemId(projectId: string, workItemId?: string): string | undefined {
    if (workItemId) return workItemId;
    const root = this.pmStore
      .listWorkItemsByProject(projectId)
      .filter((item) => !item.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return root[0]?.id;
  }

  private mapRow(row: typeof postActionReviews.$inferSelect): PostActionReviewRecord {
    return {
      id: row.id,
      event: row.event as PostActionEvent,
      agentId: row.agentId ?? undefined,
      agentSlug: row.agentSlug,
      projectId: row.projectId,
      workItemId: row.workItemId ?? undefined,
      referenceId: row.referenceId ?? undefined,
      idempotencyKey: row.idempotencyKey,
      source: row.source as "model" | "deterministic",
      status: row.status as PostActionReviewStatus,
      input: JSON.parse(row.inputJson) as PostActionReviewInput,
      result: JSON.parse(row.resultJson) as PostActionReviewResult,
      projections: JSON.parse(row.projectionsJson) as ProjectionOutcome[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function summarizeStatus(projections: ProjectionOutcome[]): PostActionReviewStatus {
  if (projections.length === 0) return "pending";
  const failed = projections.filter((projection) => projection.status === "failed");
  const applied = projections.filter((projection) => projection.status === "applied");
  if (failed.length === 0) return "completed";
  if (applied.length === 0) return "failed";
  return "partial";
}
