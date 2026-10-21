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
  | "post_action"
  | "evidence_review_requested"
  | "evidence_review_resolved"
  /**
   * A closure rule refused a work item, in its own words: the rule, the field it read and the command that
   * clears it. Recorded so a `blocked` item is legible after the process that blocked it has gone — the
   * surface that mentioned the block used to name three causes and none of them was the rule (BOARD F-088).
   */
  | "closure_refused"
  /**
   * An escalation froze a set of work items, recorded so clearing the escalation resumes the same set.
   *
   * `blockWorkItemAndDescendants` wrote `blocked` into the item it named **and into everything under it**,
   * and kept only the named item's prior status; clearing the escalation therefore left every descendant
   * frozen with no record and no route (measured 2026-10-02 on run `s08r10`, BOARD F-089).
   */
  | "escalation_paused_items"
  /**
   * The operator released a `blocked` work item that no closure rule and no pending escalation accounted for.
   *
   * The one of the four reasons a work item reads `blocked` that has no rule to name, and so no other command
   * that can clear it; the entry is what keeps the release a decision on record rather than a status change
   * (BOARD F-089, `application/pm/block-release.ts`).
   */
  | "block_released"
  /**
   * The operator re-ran a work item's own stated checks against the artifact, and they passed.
   *
   * A `done` item's checks used to run exactly once, inside the job that produced the artifact, so nothing
   * could tell a green board from a green checkout afterwards (BOARD F-122, measured on suite 11's first run).
   * The pass and the failure are separate kinds because they mean different things to a reader: one says the
   * artifact still does what it claimed, the other says it does not and the item was reopened for it.
   */
  | "verification_passed"
  /** A stated check no longer passed when the operator re-ran it; the item is not done. */
  | "verification_failed";

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

  /**
   * The entries **about** one work item, newest first — not the ones anchored to it.
   *
   * `listForWorkItem` deliberately carries a container's children: a container's journal is read to see what
   * happened under it, and the anchor is what makes that one read instead of a tree walk. A record that is
   * about exactly one item needs the other reading, and conflating them is how a container came to be
   * reported with its child's closure refusal — the child's criterion and the child's command, printed under
   * the container's own id (measured 2026-10-02, suite 08's third run `s08r10`; BOARD F-089).
   */
  listAboutWorkItem(workItemId: string, filters: JournalListFilters = {}): WorkItemJournalEntryRecord[] {
    return this.listWithConditions([eq(workItemJournalEntries.workItemId, workItemId)], filters);
  }

  /**
   * The entries about one record — a blocker, a question, a job — read by the record's own id.
   *
   * `refType` is not a filter here but the addressing: ids are uuids minted per record type, and requiring
   * both halves keeps a reader from matching a blocker's id against a job's. It exists because a freeze is a
   * record **about an escalation**: `blockWorkItemAndDescendants` writes `blocked` into the items under the
   * one it names, and clearing the escalation has to find the same set back (BOARD F-089).
   */
  listByRef(
    refType: JournalRefType,
    refId: string,
    filters: JournalListFilters = {},
  ): WorkItemJournalEntryRecord[] {
    return this.listWithConditions(
      [eq(workItemJournalEntries.refType, refType), eq(workItemJournalEntries.refId, refId)],
      filters,
    );
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
