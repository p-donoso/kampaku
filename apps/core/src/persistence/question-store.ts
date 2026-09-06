import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { KAMPAKU_AGENT_ID } from "../agents/definitions.js";
import type { AgentStore } from "./agent-store.js";
import type { BlockageStore } from "./blockage-store.js";
import type { Db } from "./db.js";
import {
  blockWorkItemAndDescendants,
  resumeWorkItemIfClear,
  type EscalationSource,
} from "./escalation-work-item.js";
import type { PmStore, WorkItemStatus } from "./pm-store.js";
import type { JournalStore } from "./journal-store.js";
import {
  recordQuestionAnsweredJournal,
  recordQuestionEscalatedJournal,
  recordQuestionRaisedJournal,
} from "../application/pm/journal-events.js";
import { agentQuestions } from "./schema.js";

export type QuestionStatus = "pending" | "answered";

export interface AgentQuestionRecord {
  id: string;
  projectId?: string;
  workItemId?: string;
  askedByAgentId: string;
  recipientAgentId: string;
  question: string;
  context?: string;
  status: QuestionStatus;
  answer?: string;
  answeredByAgentId?: string;
  escalationPath: string[];
  workItemStatusBeforePause?: WorkItemStatus;
  createdAt: string;
  answeredAt?: string;
}

export class QuestionStoreError extends Error {}

export class QuestionStore implements EscalationSource {
  private blockageStore?: BlockageStore;
  private journalStore?: JournalStore;

  constructor(
    private readonly db: Db,
    private readonly agentStore: AgentStore,
    private readonly pmStore: PmStore,
  ) {}

  setJournalStore(journalStore: JournalStore): void {
    this.journalStore = journalStore;
  }

  setBlockageStore(blockageStore: BlockageStore): void {
    this.blockageStore = blockageStore;
  }

  listPending(): AgentQuestionRecord[] {
    return this.list("pending");
  }

  listAll(): AgentQuestionRecord[] {
    return this.list();
  }

  ask(input: {
    askedByAgentId: string;
    question: string;
    context?: string;
    projectId?: string;
    workItemId?: string;
  }): AgentQuestionRecord {
    const asker = this.agentStore.getAgentBySlugOrId(input.askedByAgentId);
    if (!asker) throw new QuestionStoreError("Asking agent not found.");
    if (!input.question.trim()) throw new QuestionStoreError("Question is required.");
    if (!asker.parentId) throw new QuestionStoreError("Kampaku must ask the emperor directly.");
    const recipient = this.agentStore.getAgentBySlugOrId(asker.parentId);
    if (!recipient) throw new QuestionStoreError("Superior agent not found.");

    let workItemStatusBeforePause: WorkItemStatus | undefined;
    if (input.workItemId) {
      const workItem = this.pmStore.getWorkItem(input.workItemId);
      if (workItem) {
        workItemStatusBeforePause = blockWorkItemAndDescendants(
          this.pmStore,
          input.workItemId,
          workItem.projectId,
        );
      }
    }

    const record: AgentQuestionRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      askedByAgentId: asker.id,
      recipientAgentId: recipient.id,
      question: input.question.trim(),
      context: input.context?.trim() || undefined,
      status: "pending",
      escalationPath: [asker.id, recipient.id],
      workItemStatusBeforePause,
      createdAt: new Date().toISOString(),
    };
    this.insert(record);
    recordQuestionRaisedJournal(this.journalStore, this.pmStore, record);
    return record;
  }

  askDirect(input: {
    askedByAgentId: string;
    question: string;
    context?: string;
    projectId?: string;
    workItemId?: string;
  }): AgentQuestionRecord {
    const asker = this.agentStore.getAgentBySlugOrId(input.askedByAgentId);
    if (!asker) throw new QuestionStoreError("Asking agent not found.");
    if (!input.question.trim()) throw new QuestionStoreError("Question is required.");

    let workItemStatusBeforePause: WorkItemStatus | undefined;
    if (input.workItemId) {
      const workItem = this.pmStore.getWorkItem(input.workItemId);
      if (workItem) {
        workItemStatusBeforePause = blockWorkItemAndDescendants(
          this.pmStore,
          input.workItemId,
          workItem.projectId,
        );
      }
    }

    const record: AgentQuestionRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      askedByAgentId: asker.id,
      recipientAgentId: KAMPAKU_AGENT_ID,
      question: input.question.trim(),
      context: input.context?.trim() || undefined,
      status: "pending",
      escalationPath: [asker.id, KAMPAKU_AGENT_ID],
      workItemStatusBeforePause,
      createdAt: new Date().toISOString(),
    };
    this.insert(record);
    recordQuestionRaisedJournal(this.journalStore, this.pmStore, record);
    return record;
  }

  askFromBlocker(input: {
    askedByAgentId: string;
    question: string;
    context?: string;
    projectId?: string;
    workItemId?: string;
    recipientAgentId: string;
    escalationPath: string[];
    workItemStatusBeforePause?: WorkItemStatus;
  }): AgentQuestionRecord {
    const asker = this.agentStore.getAgentBySlugOrId(input.askedByAgentId);
    if (!asker) throw new QuestionStoreError("Asking agent not found.");
    if (!input.question.trim()) throw new QuestionStoreError("Question is required.");

    const record: AgentQuestionRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      askedByAgentId: asker.id,
      recipientAgentId: input.recipientAgentId,
      question: input.question.trim(),
      context: input.context?.trim() || undefined,
      status: "pending",
      escalationPath: input.escalationPath,
      workItemStatusBeforePause: input.workItemStatusBeforePause,
      createdAt: new Date().toISOString(),
    };
    this.insert(record);
    return record;
  }

  list(status?: QuestionStatus): AgentQuestionRecord[] {
    const rows = status
      ? this.db.select().from(agentQuestions).where(eq(agentQuestions.status, status)).all()
      : this.db.select().from(agentQuestions).all();
    return rows.map((row) => this.map(row)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  countPendingByProject(): Map<string, number> {
    const rows = this.db
      .select({
        projectId: agentQuestions.projectId,
        count: sql<number>`count(*)`,
      })
      .from(agentQuestions)
      .where(eq(agentQuestions.status, "pending"))
      .groupBy(agentQuestions.projectId)
      .all();

    const result = new Map<string, number>();
    for (const row of rows) {
      if (row.projectId) result.set(row.projectId, Number(row.count));
    }
    return result;
  }

  get(id: string): AgentQuestionRecord | undefined {
    const row = this.db.select().from(agentQuestions).where(eq(agentQuestions.id, id)).get();
    return row ? this.map(row) : undefined;
  }

  delete(id: string): void {
    const question = this.requirePending(id);
    // Retain a tombstone so chat-history recovery does not recreate an
    // explicitly removed question on the next dashboard refresh.
    this.db
      .update(agentQuestions)
      .set({ status: "answered", answer: "[Question removed as obsolete]", answeredAt: new Date().toISOString() })
      .where(eq(agentQuestions.id, question.id))
      .run();
  }

  escalate(id: string, byAgentId: string): AgentQuestionRecord {
    const question = this.requirePending(id);
    if (question.recipientAgentId !== byAgentId) {
      throw new QuestionStoreError("Only the current recipient can escalate this question.");
    }
    const recipient = this.agentStore.getAgentBySlugOrId(byAgentId);
    if (!recipient) throw new QuestionStoreError("Recipient agent not found.");
    const nextId = recipient.parentId ?? KAMPAKU_AGENT_ID;
    if (nextId === byAgentId) throw new QuestionStoreError("Question is already awaiting the emperor.");
    const path = [...question.escalationPath, nextId];
    this.db
      .update(agentQuestions)
      .set({ recipientAgentId: nextId, escalationPathJson: JSON.stringify(path) })
      .where(eq(agentQuestions.id, id))
      .run();
    const updated = { ...question, recipientAgentId: nextId, escalationPath: path };
    recordQuestionEscalatedJournal(this.journalStore, this.pmStore, question, updated);
    return updated;
  }

  answer(id: string, answer: string, answeredByAgentId = KAMPAKU_AGENT_ID): AgentQuestionRecord {
    const question = this.requirePending(id);
    if (!answer.trim()) throw new QuestionStoreError("Answer is required.");
    if (question.recipientAgentId !== answeredByAgentId) {
      throw new QuestionStoreError("Only the current recipient can answer this question.");
    }
    const answeredAt = new Date().toISOString();
    this.db
      .update(agentQuestions)
      .set({ status: "answered", answer: answer.trim(), answeredByAgentId, answeredAt })
      .where(eq(agentQuestions.id, id))
      .run();
    this.resumeWorkItemIfClear(question.workItemId, question.workItemStatusBeforePause);
    const updated = {
      ...question,
      status: "answered" as const,
      answer: answer.trim(),
      answeredByAgentId,
      answeredAt,
    };
    recordQuestionAnsweredJournal(this.journalStore, this.pmStore, updated);
    return updated;
  }

  private resumeWorkItemIfClear(workItemId?: string, fallback?: WorkItemStatus): void {
    const sources: EscalationSource[] = [this];
    if (this.blockageStore) sources.push(this.blockageStore);
    resumeWorkItemIfClear(this.pmStore, sources, workItemId, fallback);
  }

  private requirePending(id: string): AgentQuestionRecord {
    const question = this.get(id);
    if (!question) throw new QuestionStoreError("Question not found.");
    if (question.status !== "pending") throw new QuestionStoreError("Question is already answered.");
    return question;
  }

  private insert(record: AgentQuestionRecord): void {
    this.db
      .insert(agentQuestions)
      .values({
        id: record.id,
        projectId: record.projectId ?? null,
        workItemId: record.workItemId ?? null,
        askedByAgentId: record.askedByAgentId,
        recipientAgentId: record.recipientAgentId,
        question: record.question,
        context: record.context ?? null,
        status: record.status,
        escalationPathJson: JSON.stringify(record.escalationPath),
        workItemStatusBeforePause: record.workItemStatusBeforePause ?? null,
        createdAt: record.createdAt,
      })
      .run();
  }

  private map(row: typeof agentQuestions.$inferSelect): AgentQuestionRecord {
    return {
      id: row.id,
      projectId: row.projectId ?? undefined,
      workItemId: row.workItemId ?? undefined,
      askedByAgentId: row.askedByAgentId,
      recipientAgentId: row.recipientAgentId,
      question: row.question,
      context: row.context ?? undefined,
      status: row.status as QuestionStatus,
      answer: row.answer ?? undefined,
      answeredByAgentId: row.answeredByAgentId ?? undefined,
      escalationPath: JSON.parse(row.escalationPathJson) as string[],
      workItemStatusBeforePause: row.workItemStatusBeforePause as WorkItemStatus | undefined,
      createdAt: row.createdAt,
      answeredAt: row.answeredAt ?? undefined,
    };
  }
}
