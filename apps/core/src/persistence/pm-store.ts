import { eq, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { WorkItemComplexity } from "../delegator/work-item-complexity.js";
import { parseWorkItemComplexity } from "../delegator/work-item-complexity.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import {
  delegationEvents,
  projectDocuments,
  roadmapMilestones,
  wikiPageComments,
  workItems,
} from "./schema.js";
import type { ProjectRecord } from "./store.js";

export type WorkItemStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

export type MilestoneStatus = "planned" | "in_progress" | "reached" | "cancelled";

export class PmStoreError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT",
  ) {
    super(message);
    this.name = "PmStoreError";
  }
}

export interface ProjectDocumentRecord {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  contentMd: string;
  /**
   * `draft` | `pending_approval` | `published` | `archived`.
   *
   * Present on the read shape because a document listed without it cannot be told apart from a live page, and
   * a plan's documents are written `published` by `createDocument` while an agent's proposal lands
   * `pending_approval`. Measured 2026-10-20 on suite 09's `s09r1`: `get_project` mapped documents down to
   * `{slug, title}`, so *"which of them are proposals rather than published"* was unanswerable from the store
   * that held the answer (BOARD F-120).
   */
  status?: string;
  /** `shipped` | `planned` — whether the software the page describes exists. */
  maturity?: string;
  /** `plan` when the platform's plan machinery wrote it, `knowledge` otherwise. */
  origin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapMilestoneRecord {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  targetDate?: string;
  sortOrder: number;
  status: MilestoneStatus;
  successCriteria: string[];
  executedBy: "ai_agents" | "human";
}

export interface WorkItemRecord {
  id: string;
  projectId: string;
  parentId?: string;
  phaseKey?: string;
  title: string;
  description?: string;
  status: WorkItemStatus;
  priority: number;
  sortOrder: number;
  assigneeAgentId?: string;
  assignedByAgentId?: string;
  routingReason?: string;
  acceptanceCriteria: string[];
  /**
   * Paths this item's job must not write, as the plan declares them.
   *
   * Half of the freeze, and the half a plan states in words a tool can read rather than in a sentence. The other
   * half is derived from the item's own title, description and criteria at dispatch — `deriveFrozenPaths` — so an
   * item written before this column existed, or by a planner that never heard of it, still carries the freeze its
   * prose states. Empty means the plan forbids nothing.
   */
  frozenPaths: string[];
  dependsOn: string[];
  complexity?: WorkItemComplexity;
  goalId?: string;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemTreeNode {
  item: WorkItemRecord;
  children: WorkItemTreeNode[];
}

export interface DelegationEventRecord {
  id: string;
  workItemId: string;
  fromAgentId?: string;
  toAgentId: string;
  reason: string;
  occurredAt: string;
}

export interface ProjectOverview {
  project: ProjectRecord;
  documents: ProjectDocumentRecord[];
  milestones: RoadmapMilestoneRecord[];
  workItems: WorkItemTreeNode[];
}

export class PmStore extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  createDocument(doc: ProjectDocumentRecord): ProjectDocumentRecord {
    this.db.insert(projectDocuments).values({
      id: doc.id,
      projectId: doc.projectId,
      slug: doc.slug,
      title: doc.title,
      contentMd: doc.contentMd,
      status: "published",
      // A plan's own documents describe work that is **not built**: the plan is the intent, not the tree. Written
      // as `planned` so no reader takes them for a description of shipped software, and tagged `origin: plan` so
      // a re-plan can supersede exactly its own previous output (BOARD F-119, F-120).
      maturity: "planned",
      origin: "plan",
      sortOrder: 0,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }).run();
    // The **stored** record, not the argument. Returning `doc` made the caller's claim the answer: a document
    // written as `planned`/`plan` by this method came back without either field, so nothing that read the return
    // value could tell a plan page from a knowledge page (found while locking supersession, BOARD F-119).
    return this.getDocument(doc.id) ?? doc;
  }

  listDocumentsByProject(projectId: string): ProjectDocumentRecord[] {
    return this.db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.projectId, projectId))
      .all()
      .map((row) => this.mapDocument(row));
  }

  getDocument(id: string): ProjectDocumentRecord | undefined {
    const row = this.db.select().from(projectDocuments).where(eq(projectDocuments.id, id)).get();
    if (!row) return undefined;
    return this.mapDocument(row);
  }

  updateDocument(
    id: string,
    patch: Partial<Pick<ProjectDocumentRecord, "title" | "contentMd" | "status" | "maturity" | "origin">>,
  ): ProjectDocumentRecord | undefined {
    const existing = this.getDocument(id);
    if (!existing) return undefined;

    const updated: ProjectDocumentRecord = {
      ...existing,
      title: patch.title ?? existing.title,
      contentMd: patch.contentMd ?? existing.contentMd,
      status: patch.status ?? existing.status,
      maturity: patch.maturity === undefined ? existing.maturity : patch.maturity,
      origin: patch.origin ?? existing.origin,
      updatedAt: new Date().toISOString(),
    };

    // Every field the patch touched is written. It used to set only `title`, `contentMd` and `updatedAt`, so a
    // caller that archived a document got `200` and a row that still read `published` — a status change the
    // write path reported and did not make (found while adding supersession for BOARD F-119).
    this.db
      .update(projectDocuments)
      .set({
        title: updated.title,
        contentMd: updated.contentMd,
        status: updated.status ?? "published",
        maturity: updated.maturity ?? null,
        origin: updated.origin ?? null,
        updatedAt: updated.updatedAt,
      })
      .where(eq(projectDocuments.id, id))
      .run();

    return updated;
  }

  deleteProjectData(projectId: string): void {
    const items = this.db
      .select()
      .from(workItems)
      .where(eq(workItems.projectId, projectId))
      .all();

    for (const item of items) {
      this.db
        .delete(delegationEvents)
        .where(eq(delegationEvents.workItemId, item.id))
        .run();
    }

    this.db.delete(workItems).where(eq(workItems.projectId, projectId)).run();
    this.db.delete(roadmapMilestones).where(eq(roadmapMilestones.projectId, projectId)).run();
    this.db.delete(wikiPageComments).where(eq(wikiPageComments.projectId, projectId)).run();
    this.db.delete(projectDocuments).where(eq(projectDocuments.projectId, projectId)).run();
  }

  createMilestone(milestone: RoadmapMilestoneRecord): RoadmapMilestoneRecord {
    this.db.insert(roadmapMilestones).values({
      id: milestone.id,
      projectId: milestone.projectId,
      title: milestone.title,
      description: milestone.description ?? null,
      targetDate: milestone.targetDate ?? null,
      sortOrder: milestone.sortOrder,
      status: milestone.status,
      successCriteriaJson: JSON.stringify(milestone.successCriteria),
      executedBy: milestone.executedBy,
    }).run();
    return milestone;
  }

  /**
   * Marks a milestone as replaced. Used when a new plan supersedes the previous one: the old milestone stays
   * readable with its own history, and stops being published as current.
   */
  setMilestoneStatus(id: string, status: MilestoneStatus): void {
    this.db.update(roadmapMilestones).set({ status }).where(eq(roadmapMilestones.id, id)).run();
  }

  listMilestonesByProject(projectId: string): RoadmapMilestoneRecord[] {
    return this.db
      .select()
      .from(roadmapMilestones)
      .where(eq(roadmapMilestones.projectId, projectId))
      .all()
      .map((row) => this.mapMilestone(row))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  createWorkItem(item: WorkItemRecord): WorkItemRecord {
    if (item.parentId) {
      this.validateParentMove(item.id, item.parentId, item.projectId);
    }

    this.db.insert(workItems).values({
      id: item.id,
      projectId: item.projectId,
      parentId: item.parentId ?? null,
      phaseKey: item.phaseKey ?? null,
      title: item.title,
      description: item.description ?? null,
      status: item.status,
      priority: item.priority,
      sortOrder: item.sortOrder,
      assigneeAgentId: item.assigneeAgentId ?? null,
      assignedByAgentId: item.assignedByAgentId ?? null,
      routingReason: item.routingReason ?? null,
      acceptanceCriteriaJson: JSON.stringify(item.acceptanceCriteria),
      // Read defensively: this column was added after work items existed, and the callers that build a record
      // from a fixture or from an older path may not carry the field. Absent means "this item freezes nothing",
      // which is also what every row written before the column reads back as.
      frozenPathsJson: (item.frozenPaths ?? []).length > 0 ? JSON.stringify(item.frozenPaths) : null,
      dependsOnJson: JSON.stringify(item.dependsOn),
      complexityJson: item.complexity ? JSON.stringify(item.complexity) : null,
      goalId: item.goalId ?? null,
      jobId: item.jobId ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }).run();
    return item;
  }

  updateWorkItem(
    id: string,
    patch: Partial<
      Pick<
        WorkItemRecord,
        | "title"
        | "description"
        | "status"
        | "priority"
        | "sortOrder"
        | "parentId"
        | "phaseKey"
        | "assigneeAgentId"
        | "assignedByAgentId"
        | "routingReason"
        | "goalId"
        | "jobId"
        | "complexity"
      >
    >,
  ): WorkItemRecord | undefined {
    const existing = this.getWorkItem(id);
    if (!existing) return undefined;

    if (patch.parentId !== undefined) {
      if (patch.parentId) {
        this.validateParentMove(id, patch.parentId, existing.projectId);
      }
    }

    const updated: WorkItemRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .update(workItems)
      .set({
        title: updated.title,
        description: updated.description ?? null,
        status: updated.status,
        priority: updated.priority,
        sortOrder: updated.sortOrder,
        parentId: updated.parentId ?? null,
        phaseKey: updated.phaseKey ?? null,
        assigneeAgentId: updated.assigneeAgentId ?? null,
        assignedByAgentId: updated.assignedByAgentId ?? null,
        routingReason: updated.routingReason ?? null,
        acceptanceCriteriaJson: JSON.stringify(updated.acceptanceCriteria),
        frozenPathsJson: (updated.frozenPaths ?? []).length > 0 ? JSON.stringify(updated.frozenPaths) : null,
        dependsOnJson: JSON.stringify(updated.dependsOn),
        complexityJson: updated.complexity ? JSON.stringify(updated.complexity) : null,
        goalId: updated.goalId ?? null,
        jobId: updated.jobId ?? null,
        updatedAt: updated.updatedAt,
      })
      .where(eq(workItems.id, id))
      .run();

    return updated;
  }

  deleteWorkItem(id: string, options?: { cascade?: boolean }): void {
    const existing = this.getWorkItem(id);
    if (!existing) throw new PmStoreError("Work item not found.", "NOT_FOUND");

    const children = this.listWorkItemsByProject(existing.projectId).filter(
      (item) => item.parentId === id,
    );

    if (children.length > 0 && !options?.cascade) {
      throw new PmStoreError("Work item has children. Use cascade=true to delete.", "CONFLICT");
    }

    if (options?.cascade) {
      for (const child of children) {
        this.deleteWorkItem(child.id, { cascade: true });
      }
    }

    this.db.delete(delegationEvents).where(eq(delegationEvents.workItemId, id)).run();
    this.db.delete(workItems).where(eq(workItems.id, id)).run();
  }

  validateParentMove(itemId: string, newParentId: string, projectId: string): void {
    if (itemId === newParentId) {
      throw new PmStoreError("A work item cannot be its own parent.", "VALIDATION");
    }

    const parent = this.getWorkItem(newParentId);
    if (!parent) {
      throw new PmStoreError("Parent work item not found.", "NOT_FOUND");
    }
    if (parent.projectId !== projectId) {
      throw new PmStoreError("Parent must belong to the same project.", "VALIDATION");
    }

    const descendants = this.collectDescendantIds(itemId);
    if (descendants.has(newParentId)) {
      throw new PmStoreError("Cannot move a work item under its own descendant.", "VALIDATION");
    }
  }

  collectDescendantIds(itemId: string): Set<string> {
    const result = new Set<string>();
    const item = this.getWorkItem(itemId);
    if (!item) return result;

    const allItems = this.listWorkItemsByProject(item.projectId);
    const byParent = new Map<string, WorkItemRecord[]>();
    for (const wi of allItems) {
      if (wi.parentId) {
        const bucket = byParent.get(wi.parentId) ?? [];
        bucket.push(wi);
        byParent.set(wi.parentId, bucket);
      }
    }

    const visit = (id: string) => {
      for (const child of byParent.get(id) ?? []) {
        result.add(child.id);
        visit(child.id);
      }
    };
    visit(itemId);
    return result;
  }

  getAncestors(itemId: string): WorkItemRecord[] {
    const ancestors: WorkItemRecord[] = [];
    let current = this.getWorkItem(itemId);
    while (current?.parentId) {
      const parent = this.getWorkItem(current.parentId);
      if (!parent) break;
      ancestors.push(parent);
      current = parent;
    }
    return ancestors;
  }

  getWorkItem(id: string): WorkItemRecord | undefined {
    const row = this.db.select().from(workItems).where(eq(workItems.id, id)).get();
    if (!row) return undefined;
    return this.mapWorkItem(row);
  }

  getWorkItemByGoalId(goalId: string): WorkItemRecord | undefined {
    const row = this.db.select().from(workItems).where(eq(workItems.goalId, goalId)).get();
    if (!row) return undefined;
    return this.mapWorkItem(row);
  }

  getWorkItemByJobId(jobId: string): WorkItemRecord | undefined {
    const row = this.db.select().from(workItems).where(eq(workItems.jobId, jobId)).get();
    if (!row) return undefined;
    return this.mapWorkItem(row);
  }

  listWorkItemsByProject(projectId: string): WorkItemRecord[] {
    return this.db
      .select()
      .from(workItems)
      .where(eq(workItems.projectId, projectId))
      .all()
      .map((row) => this.mapWorkItem(row));
  }

  listWorkItemsForAgents(agentIds: string[]): WorkItemRecord[] {
    if (agentIds.length === 0) return [];
    return this.db
      .select()
      .from(workItems)
      .where(inArray(workItems.assigneeAgentId, agentIds))
      .all()
      .map((row) => this.mapWorkItem(row));
  }

  listAllWorkItems(): WorkItemRecord[] {
    return this.db.select().from(workItems).all().map((row) => this.mapWorkItem(row));
  }

  latestDelegationByAgent(): Map<string, string> {
    const rows = this.db
      .select({
        toAgentId: delegationEvents.toAgentId,
        latest: sql<string>`max(${delegationEvents.occurredAt})`,
      })
      .from(delegationEvents)
      .groupBy(delegationEvents.toAgentId)
      .all();

    return new Map(rows.map((row) => [row.toAgentId, row.latest]));
  }

  buildWorkItemTree(items: WorkItemRecord[]): WorkItemTreeNode[] {
    const itemIds = new Set(items.map((item) => item.id));
    const byParent = new Map<string | null, WorkItemRecord[]>();
    for (const item of items) {
      const key = item.parentId && itemIds.has(item.parentId) ? item.parentId : null;
      const bucket = byParent.get(key) ?? [];
      bucket.push(item);
      byParent.set(key, bucket);
    }

    const build = (parentId: string | null): WorkItemTreeNode[] => {
      const nodes = byParent.get(parentId) ?? [];
      return nodes
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            b.priority - a.priority ||
            a.title.localeCompare(b.title),
        )
        .map((item) => ({
          item,
          children: build(item.id),
        }));
    };

    return build(null);
  }

  getProjectOverview(project: ProjectRecord): ProjectOverview {
    const items = this.listWorkItemsByProject(project.id);
    return {
      project,
      documents: this.listDocumentsByProject(project.id),
      milestones: this.listMilestonesByProject(project.id),
      workItems: this.buildWorkItemTree(items),
    };
  }

  recordDelegationEvent(event: Omit<DelegationEventRecord, "id">): DelegationEventRecord {
    const record: DelegationEventRecord = { id: uuidv4(), ...event };
    this.db.insert(delegationEvents).values({
      id: record.id,
      workItemId: record.workItemId,
      fromAgentId: record.fromAgentId ?? null,
      toAgentId: record.toAgentId,
      reason: record.reason,
      occurredAt: record.occurredAt,
    }).run();
    return record;
  }

  listDelegationEventsByWorkItem(workItemId: string): DelegationEventRecord[] {
    return this.db
      .select()
      .from(delegationEvents)
      .where(eq(delegationEvents.workItemId, workItemId))
      .all()
      .map((row) => ({
        id: row.id,
        workItemId: row.workItemId,
        fromAgentId: row.fromAgentId ?? undefined,
        toAgentId: row.toAgentId,
        reason: row.reason,
        occurredAt: row.occurredAt,
      }));
  }

  private mapDocument(row: typeof projectDocuments.$inferSelect): ProjectDocumentRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      slug: row.slug,
      title: row.title,
      contentMd: row.contentMd,
      status: row.status ?? "published",
      maturity: row.maturity ?? undefined,
      origin: row.origin ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapMilestone(row: typeof roadmapMilestones.$inferSelect): RoadmapMilestoneRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      description: row.description ?? undefined,
      targetDate: row.targetDate ?? undefined,
      sortOrder: row.sortOrder ?? 0,
      status: row.status as MilestoneStatus,
      successCriteria: row.successCriteriaJson
        ? (JSON.parse(row.successCriteriaJson) as string[])
        : [],
      executedBy: (row.executedBy ?? "ai_agents") as "ai_agents" | "human",
    };
  }

  private mapWorkItem(row: typeof workItems.$inferSelect): WorkItemRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      parentId: row.parentId ?? undefined,
      phaseKey: row.phaseKey ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as WorkItemStatus,
      priority: row.priority ?? 0,
      sortOrder: row.sortOrder ?? 0,
      assigneeAgentId: row.assigneeAgentId ?? undefined,
      assignedByAgentId: row.assignedByAgentId ?? undefined,
      routingReason: row.routingReason ?? undefined,
      frozenPaths: row.frozenPathsJson ? (JSON.parse(row.frozenPathsJson) as string[]) : [],
      acceptanceCriteria: row.acceptanceCriteriaJson
        ? (JSON.parse(row.acceptanceCriteriaJson) as string[])
        : [],
      dependsOn: row.dependsOnJson ? (JSON.parse(row.dependsOnJson) as string[]) : [],
      complexity: parseWorkItemComplexity(row.complexityJson),
      goalId: row.goalId ?? undefined,
      jobId: row.jobId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
