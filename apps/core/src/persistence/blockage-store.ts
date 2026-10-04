import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { KAMPAKU_AGENT_ID } from "../agents/definitions.js";
import type { AgentStore } from "./agent-store.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import {
  blockWorkItemSubtree,
  recordPausedWorkItems,
  resumePausedWorkItems,
  resumeWorkItemIfClear,
  type EscalationSource,
  type FrozenWorkItem,
} from "./escalation-work-item.js";
import type { PmStore, WorkItemRecord, WorkItemStatus } from "./pm-store.js";
import type { QuestionStore } from "./question-store.js";
import type { JournalStore } from "./journal-store.js";
import {
  completeBlockerTriageWorkItem,
  ensureBlockerTriageWorkItem,
  reassignBlockerTriageWorkItem,
} from "../application/pm/blocker-triage.js";
import {
  recordBlockerConvertedJournal,
  recordBlockerDelegatedJournal,
  recordBlockerEscalatedJournal,
  recordBlockerReportedJournal,
  recordBlockerResolvedJournal,
} from "../application/pm/journal-events.js";
import { agentBlockages } from "./schema.js";

export type BlockageStatus = "pending" | "resolved";
export type BlockageResolutionKind = "resolved" | "delegated" | "converted_to_question" | "escalated";

export interface AgentBlockageRecord {
  id: string;
  projectId?: string;
  workItemId?: string;
  reportedByAgentId: string;
  recipientAgentId: string;
  description: string;
  context?: string;
  status: BlockageStatus;
  resolution?: string;
  resolutionKind?: BlockageResolutionKind;
  resolvedByAgentId?: string;
  escalationPath: string[];
  workItemStatusBeforePause?: WorkItemStatus;
  createdAt: string;
  resolvedAt?: string;
}

export class BlockageStoreError extends Error {}

export class BlockageStore extends BaseStore implements EscalationSource {
  private questionStore?: QuestionStore;
  private journalStore?: JournalStore;

  constructor(
    db: Db,
    private readonly agentStore: AgentStore,
    private readonly pmStore: PmStore,
  ) {
    super(db);
  }

  setJournalStore(journalStore: JournalStore): void {
    this.journalStore = journalStore;
  }

  setQuestionStore(questionStore: QuestionStore): void {
    this.questionStore = questionStore;
  }

  listPending(): AgentBlockageRecord[] {
    return this.list("pending");
  }

  listAll(): AgentBlockageRecord[] {
    return this.list();
  }

  report(input: {
    reportedByAgentId: string;
    description: string;
    context?: string;
    projectId?: string;
    workItemId?: string;
  }): AgentBlockageRecord {
    const reporter = this.agentStore.getAgentBySlugOrId(input.reportedByAgentId);
    if (!reporter) throw new BlockageStoreError("Reporting agent not found.");
    if (!input.description.trim()) throw new BlockageStoreError("Blocker description is required.");
    if (!reporter.parentId) throw new BlockageStoreError("Kampaku must report blockers to the emperor directly.");
    let recipient = this.agentStore.getAgentBySlugOrId(reporter.parentId);
    if (!recipient) throw new BlockageStoreError("Superior agent not found.");

    // Kampaku has no autonomous triage tools. When a project lead (parent=kampaku) reports,
    // keep triage on the lead instead of escalating to kampaku.
    if (recipient.slug === "kampaku") {
      recipient = reporter;
    }

    let workItemStatusBeforePause: WorkItemStatus | undefined;
    let paused: FrozenWorkItem[] = [];
    if (input.workItemId) {
      const workItem = this.pmStore.getWorkItem(input.workItemId);
      if (workItem) {
        const pause = blockWorkItemSubtree(this.pmStore, input.workItemId, workItem.projectId);
        workItemStatusBeforePause = pause.statusBeforePause;
        paused = pause.frozen;
      }
    }

    const record: AgentBlockageRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      reportedByAgentId: reporter.id,
      recipientAgentId: recipient.id,
      description: input.description.trim(),
      context: input.context?.trim() || undefined,
      status: "pending",
      escalationPath: [reporter.id, recipient.id],
      workItemStatusBeforePause,
      createdAt: new Date().toISOString(),
    };
    this.insert(record);
    recordPausedWorkItems(this.journalStore, this.pmStore, {
      workItemId: record.workItemId ?? "",
      projectId: record.projectId,
      refType: "blocker",
      refId: record.id,
      frozen: paused,
      occurredAt: record.createdAt,
    });
    recordBlockerReportedJournal(this.journalStore, this.pmStore, record);
    ensureBlockerTriageWorkItem(this.pmStore, this.agentStore, this, record);
    return record;
  }

  list(status?: BlockageStatus): AgentBlockageRecord[] {
    const rows = status
      ? this.db.select().from(agentBlockages).where(eq(agentBlockages.status, status)).all()
      : this.db.select().from(agentBlockages).all();
    return rows.map((row) => this.map(row)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  countPendingByProject(): Map<string, number> {
    const rows = this.db
      .select({
        projectId: agentBlockages.projectId,
        count: sql<number>`count(*)`,
      })
      .from(agentBlockages)
      .where(eq(agentBlockages.status, "pending"))
      .groupBy(agentBlockages.projectId)
      .all();

    const result = new Map<string, number>();
    for (const row of rows) {
      if (row.projectId) result.set(row.projectId, Number(row.count));
    }
    return result;
  }

  get(id: string): AgentBlockageRecord | undefined {
    const row = this.db.select().from(agentBlockages).where(eq(agentBlockages.id, id)).get();
    return row ? this.map(row) : undefined;
  }

  escalate(id: string, byAgentId: string): AgentBlockageRecord {
    const blocker = this.requirePending(id);
    if (blocker.recipientAgentId !== byAgentId) {
      throw new BlockageStoreError("Only the current recipient can escalate this blocker.");
    }
    const recipient = this.agentStore.getAgentBySlugOrId(byAgentId);
    if (!recipient) throw new BlockageStoreError("Recipient agent not found.");
    const nextId = recipient.parentId ?? KAMPAKU_AGENT_ID;
    if (nextId === byAgentId) throw new BlockageStoreError("Blocker is already awaiting the emperor.");
    const path = [...blocker.escalationPath, nextId];
    this.db
      .update(agentBlockages)
      .set({
        recipientAgentId: nextId,
        escalationPathJson: JSON.stringify(path),
        resolutionKind: "escalated",
      })
      .where(eq(agentBlockages.id, id))
      .run();
    const updated = { ...blocker, recipientAgentId: nextId, escalationPath: path, resolutionKind: "escalated" as const };
    reassignBlockerTriageWorkItem(this.pmStore, blocker.id, nextId);
    recordBlockerEscalatedJournal(this.journalStore, this.pmStore, blocker, updated);
    return updated;
  }

  resolve(
    id: string,
    resolution: string,
    resolvedByAgentId = KAMPAKU_AGENT_ID,
    resolutionKind: BlockageResolutionKind = "resolved",
  ): AgentBlockageRecord {
    const blocker = this.requirePending(id);
    if (!resolution.trim()) throw new BlockageStoreError("Resolution is required.");
    if (blocker.recipientAgentId !== resolvedByAgentId) {
      throw new BlockageStoreError("Only the current recipient can resolve this blocker.");
    }
    const resolvedAt = new Date().toISOString();
    this.db
      .update(agentBlockages)
      .set({
        status: "resolved",
        resolution: resolution.trim(),
        resolutionKind,
        resolvedByAgentId,
        resolvedAt,
      })
      .where(eq(agentBlockages.id, id))
      .run();
    this.resumeWorkItemIfClear(blocker.workItemId, blocker.workItemStatusBeforePause, blocker.id);
    const updated = {
      ...blocker,
      status: "resolved" as const,
      resolution: resolution.trim(),
      resolutionKind,
      resolvedByAgentId,
      resolvedAt,
    };
    completeBlockerTriageWorkItem(this.pmStore, blocker.id);
    if (resolutionKind === "resolved") {
      recordBlockerResolvedJournal(this.journalStore, this.pmStore, updated);
    }
    return updated;
  }

  convertToQuestion(
    id: string,
    byAgentId: string,
    questionStore: QuestionStore,
  ): { blocker: AgentBlockageRecord; question: ReturnType<QuestionStore["ask"]> } {
    const blocker = this.requirePending(id);
    if (blocker.recipientAgentId !== byAgentId) {
      throw new BlockageStoreError("Only the current recipient can convert this blocker.");
    }

    const reporter = this.agentStore.getAgentBySlugOrId(blocker.reportedByAgentId);
    if (!reporter) throw new BlockageStoreError("Reporting agent not found.");

    const question = questionStore.askFromBlocker({
      askedByAgentId: reporter.slug,
      question: blocker.description,
      context: blocker.context,
      projectId: blocker.projectId,
      workItemId: blocker.workItemId,
      recipientAgentId: blocker.recipientAgentId,
      escalationPath: blocker.escalationPath,
      workItemStatusBeforePause: blocker.workItemStatusBeforePause,
    });

    const resolved = this.resolve(
      id,
      `Converted to question ${question.id}.`,
      byAgentId,
      "converted_to_question",
    );

    recordBlockerConvertedJournal(this.journalStore, this.pmStore, resolved, question);

    return { blocker: resolved, question };
  }

  delegate(
    id: string,
    byAgentId: string,
    input: {
      title: string;
      assigneeAgentId: string;
      description?: string;
      parentId?: string;
    },
  ): { blocker: AgentBlockageRecord; workItem: WorkItemRecord } {
    const blocker = this.requirePending(id);
    if (blocker.recipientAgentId !== byAgentId) {
      throw new BlockageStoreError("Only the current recipient can delegate this blocker.");
    }
    if (!input.title.trim()) throw new BlockageStoreError("Delegated task title is required.");
    if (!blocker.projectId) throw new BlockageStoreError("Blocker has no project; cannot delegate.");

    const assignee = this.agentStore.getAgentBySlugOrId(input.assigneeAgentId);
    if (!assignee) throw new BlockageStoreError("Assignee agent not found.");

    const projectId = blocker.projectId;
    const parentId = input.parentId ?? blocker.workItemId;
    const siblings = this.pmStore
      .listWorkItemsByProject(projectId)
      .filter((item) => (item.parentId ?? null) === (parentId ?? null));
    const maxSort = siblings.reduce((max, item) => Math.max(max, item.sortOrder), -1);
    const now = new Date().toISOString();

    const workItem = this.pmStore.createWorkItem({
      id: uuidv4(),
      projectId,
      parentId,
      title: input.title.trim(),
      description: input.description?.trim() || blocker.description,
      status: "todo",
      priority: 0,
      sortOrder: maxSort + 1,
      assigneeAgentId: assignee.id,
      acceptanceCriteria: [],
      // Generated from a blocker, not authored by a plan: nothing frozen. Its dispatch re-derives from the text
      // either way, so a description that does state a freeze still enforces it.
      frozenPaths: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const resolved = this.resolve(
      id,
      `Delegated to work item ${workItem.id} assigned to ${assignee.slug}.`,
      byAgentId,
      "delegated",
    );

    recordBlockerDelegatedJournal(
      this.journalStore,
      this.pmStore,
      this.agentStore,
      resolved,
      workItem,
      byAgentId,
    );

    return { blocker: resolved, workItem };
  }

  private resumeWorkItemIfClear(workItemId?: string, fallback?: WorkItemStatus, blockerId?: string): void {
    const sources: EscalationSource[] = [this];
    if (this.questionStore) sources.push(this.questionStore);
    resumeWorkItemIfClear(this.pmStore, sources, workItemId, fallback);
    // And everything this blocker froze on the way down: the row above carries one status, and the items
    // under it were left `blocked` with no record of their own before this (BOARD F-089).
    if (blockerId) {
      resumePausedWorkItems(this.pmStore, this.journalStore, sources, "blocker", blockerId);
    }
  }

  private requirePending(id: string): AgentBlockageRecord {
    const blocker = this.get(id);
    if (!blocker) throw new BlockageStoreError("Blocker not found.");
    if (blocker.status !== "pending") throw new BlockageStoreError("Blocker is already resolved.");
    return blocker;
  }

  private insert(record: AgentBlockageRecord): void {
    this.db
      .insert(agentBlockages)
      .values({
        id: record.id,
        projectId: record.projectId ?? null,
        workItemId: record.workItemId ?? null,
        reportedByAgentId: record.reportedByAgentId,
        recipientAgentId: record.recipientAgentId,
        description: record.description,
        context: record.context ?? null,
        status: record.status,
        escalationPathJson: JSON.stringify(record.escalationPath),
        workItemStatusBeforePause: record.workItemStatusBeforePause ?? null,
        createdAt: record.createdAt,
      })
      .run();
  }

  private map(row: typeof agentBlockages.$inferSelect): AgentBlockageRecord {
    return {
      id: row.id,
      projectId: row.projectId ?? undefined,
      workItemId: row.workItemId ?? undefined,
      reportedByAgentId: row.reportedByAgentId,
      recipientAgentId: row.recipientAgentId,
      description: row.description,
      context: row.context ?? undefined,
      status: row.status as BlockageStatus,
      resolution: row.resolution ?? undefined,
      resolutionKind: (row.resolutionKind as BlockageResolutionKind | null) ?? undefined,
      resolvedByAgentId: row.resolvedByAgentId ?? undefined,
      escalationPath: JSON.parse(row.escalationPathJson) as string[],
      workItemStatusBeforePause: row.workItemStatusBeforePause as WorkItemStatus | undefined,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt ?? undefined,
    };
  }
}
