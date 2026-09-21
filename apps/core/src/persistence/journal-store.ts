import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import type { PmStore, WorkItemRecord } from "./pm-store.js";
import { workItemJournalEntries } from "./schema.js";

export type JournalEntryKind =
  | "delegation"
  | "completion_report"
  | "question_raised"
  | "question_answered"
  | "question_escalated"
  | "blocker_reported"
  | "blocker_resolved"
  | "blocker_delegated"
  | "blocker_escalated"
  | "blocker_converted"
  | "audit_proposal"
  | "deliverable_audit"
  | "phase_gate"
  | "risk_reported"
  | "risk_updated"
  | "peer_review_requested"
  | "peer_review_updated"
  | "handoff_requested"
  | "handoff_updated"
  | "post_action";

export type JournalRefType =
  | "job"
  | "question"
  | "blocker"
  | "delegation"
  | "work_item"
  | "post_action_review";

export interface WorkItemJournalEntryRecord {
  id: string;
  projectId: string;
  workItemId: string;
  anchorWorkItemId: string;
  kind: JournalEntryKind;
  fromAgentId?: string;
  toAgentId?: string;
  title: string;
  body: string;
  refType?: JournalRefType;
  refId?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface JournalListFilters {
  kinds?: JournalEntryKind[];
  limit?: number;
  before?: string;
}

export class JournalStore extends BaseStore {
  constructor(
    db: Db,
    private readonly pmStore: PmStore,
  ) {
    super(db);
  }

  resolveAnchorWorkItemId(workItem: WorkItemRecord): string {
    return workItem.parentId ?? workItem.id;
  }

  resolveAnchorForWorkItemId(workItemId: string): string | undefined {
    const workItem = this.pmStore.getWorkItem(workItemId);
    if (!workItem) return undefined;
    return this.resolveAnchorWorkItemId(workItem);
  }

  append(input: {
    projectId: string;
    workItemId: string;
    anchorWorkItemId?: string;
    kind: JournalEntryKind;
    fromAgentId?: string;
    toAgentId?: string;
    title: string;
    body: string;
    refType?: JournalRefType;
    refId?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  }): WorkItemJournalEntryRecord {
    const workItem = this.pmStore.getWorkItem(input.workItemId);
    if (!workItem) {
      throw new Error(`Work item not found: ${input.workItemId}`);
    }

    const record: WorkItemJournalEntryRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      anchorWorkItemId: input.anchorWorkItemId ?? this.resolveAnchorWorkItemId(workItem),
      kind: input.kind,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      title: input.title.trim(),
      body: input.body.trim(),
      refType: input.refType,
      refId: input.refId,
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };

    if (!record.title) {
      throw new Error("Journal entry title is required.");
    }

    this.db
      .insert(workItemJournalEntries)
      .values({
        id: record.id,
        projectId: record.projectId,
        workItemId: record.workItemId,
        anchorWorkItemId: record.anchorWorkItemId,
        kind: record.kind,
        fromAgentId: record.fromAgentId ?? null,
        toAgentId: record.toAgentId ?? null,
        title: record.title,
        body: record.body,
        refType: record.refType ?? null,
        refId: record.refId ?? null,
        metadataJson: JSON.stringify(record.metadata),
        occurredAt: record.occurredAt,
      })
      .run();

    return record;
  }

  getById(id: string): WorkItemJournalEntryRecord | undefined {
    const row = this.db
      .select()
      .from(workItemJournalEntries)
      .where(eq(workItemJournalEntries.id, id))
      .get();
    return row ? this.mapRow(row) : undefined;
  }

  listByAnchor(anchorWorkItemId: string, filters: JournalListFilters = {}): WorkItemJournalEntryRecord[] {
    const conditions = [eq(workItemJournalEntries.anchorWorkItemId, anchorWorkItemId)];
    return this.listWithConditions(conditions, filters);
  }

  listForWorkItem(workItemId: string, filters: JournalListFilters = {}): WorkItemJournalEntryRecord[] {
    const conditions = [
      or(
        eq(workItemJournalEntries.workItemId, workItemId),
        eq(workItemJournalEntries.anchorWorkItemId, workItemId),
      )!,
    ];
    return this.listWithConditions(conditions, filters);
  }

  listByProject(projectId: string, filters: JournalListFilters & { workItemId?: string } = {}): WorkItemJournalEntryRecord[] {
    if (filters.workItemId) {
      return this.listForWorkItem(filters.workItemId, filters).filter((entry) => entry.projectId === projectId);
    }
    const conditions = [eq(workItemJournalEntries.projectId, projectId)];
    return this.listWithConditions(conditions, filters);
  }

  countByAnchor(anchorWorkItemId: string): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(workItemJournalEntries)
      .where(eq(workItemJournalEntries.anchorWorkItemId, anchorWorkItemId))
      .get();
    return row?.count ?? 0;
  }

  countByAnchors(anchorWorkItemIds: string[]): Map<string, number> {
    if (anchorWorkItemIds.length === 0) return new Map();
    const rows = this.db
      .select({
        anchorWorkItemId: workItemJournalEntries.anchorWorkItemId,
        count: sql<number>`count(*)`,
      })
      .from(workItemJournalEntries)
      .where(inArray(workItemJournalEntries.anchorWorkItemId, anchorWorkItemIds))
      .groupBy(workItemJournalEntries.anchorWorkItemId)
      .all();
    return new Map(rows.map((row) => [row.anchorWorkItemId, row.count]));
  }

  private listWithConditions(
    conditions: ReturnType<typeof eq>[],
    filters: JournalListFilters,
  ): WorkItemJournalEntryRecord[] {
    if (filters.kinds?.length) {
      conditions.push(inArray(workItemJournalEntries.kind, filters.kinds));
    }
    if (filters.before) {
      conditions.push(lt(workItemJournalEntries.occurredAt, filters.before));
    }

    const limit = filters.limit ?? 100;
    const rows = this.db
      .select()
      .from(workItemJournalEntries)
      .where(and(...conditions))
      .orderBy(desc(workItemJournalEntries.occurredAt))
      .limit(limit)
      .all();

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: typeof workItemJournalEntries.$inferSelect): WorkItemJournalEntryRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      workItemId: row.workItemId,
      anchorWorkItemId: row.anchorWorkItemId,
      kind: row.kind as JournalEntryKind,
      fromAgentId: row.fromAgentId ?? undefined,
      toAgentId: row.toAgentId ?? undefined,
      title: row.title,
      body: row.body,
      refType: (row.refType as JournalRefType | null) ?? undefined,
      refId: row.refId ?? undefined,
      metadata: row.metadataJson ? (JSON.parse(row.metadataJson) as Record<string, unknown>) : {},
      occurredAt: row.occurredAt,
    };
  }
}
