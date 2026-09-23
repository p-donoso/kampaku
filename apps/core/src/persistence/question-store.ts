import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { KAMPAKU_AGENT_ID } from "../agents/definitions.js";
import type { AgentStore } from "./agent-store.js";
import type { BlockageStore } from "./blockage-store.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
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
import { matchesQuestionId } from "../agents/runtime/pending-question.js";

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

export class QuestionStore extends BaseStore implements EscalationSource {
  private blockageStore?: BlockageStore;
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

  /**
   * Records a decision the ROOT agent needs from the emperor.
   *
   * `ask()` deliberately refuses a parentless asker ("Kampaku must ask the emperor
   * directly"), which left the root agent's questions with no durable representation:
   * the `<kampaku-question>` tag was rendered by the web client and persisted nowhere.
   * That is LangProbe gap G-01.
   *
   * The emperor is not an agent, so a question awaiting the emperor is addressed to the
   * root agent id — which is the convention `escalate()` already uses (`recipient.parentId
   * ?? KAMPAKU_AGENT_ID`, and "already awaiting the emperor" when it would loop). Because
   * `answer()` defaults to that same id, an emperor-directed question is answerable from
   * the CLI and the UI with no change to those paths.
   *
   * Idempotent by question id: the protocol tells the agent to re-ask with the same id, so
   * a second call returns the existing pending record instead of duplicating it.
   */
  askEmperor(input: {
    askedByAgentId: string;
    question: string;
    questionId?: string;
    context?: string;
    projectId?: string;
    workItemId?: string;
  }): { question: AgentQuestionRecord; created: boolean } {
    const asker = this.agentStore.getAgentBySlugOrId(input.askedByAgentId);
    if (!asker) throw new QuestionStoreError("Asking agent not found.");
    if (!input.question.trim()) throw new QuestionStoreError("Question is required.");

    // Idempotent across **all** statuses, not only pending.
    //
    // Deduping against pending questions alone was a real defect, and it created an endless loop in the
    // probe: an agent that repeats the same question every turn — which it does, since it cannot see that
    // it already asked — had each repetition persisted as a *new* pending question as soon as the
    // previous one was answered. The pending count never reached zero, the agent read that count as a
    // blocker on its own planning, refused to plan, repeated the question, and looped. Measured: four
    // consecutive turns citing a blocker whose only source was the agent's own repeated question.
    //
    // A question id the agent already used is already on record. Re-asking it must not open it again.
    if (input.questionId) {
      const existing = this.list().find((candidate) =>
        matchesQuestionId(candidate.question, input.questionId as string),
      );
      if (existing) return { question: existing, created: false };
    }

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

    // The root agent asking the emperor addresses itself: one hop, no distinct superior.
    const escalationPath =
      asker.id === KAMPAKU_AGENT_ID ? [KAMPAKU_AGENT_ID] : [asker.id, KAMPAKU_AGENT_ID];

    const record: AgentQuestionRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      askedByAgentId: asker.id,
      recipientAgentId: KAMPAKU_AGENT_ID,
      question: input.question.trim(),
      context: input.context?.trim() || undefined,
      status: "pending",
      escalationPath,
      workItemStatusBeforePause,
      createdAt: new Date().toISOString(),
    };
    this.insert(record);
    recordQuestionRaisedJournal(this.journalStore, this.pmStore, record);
    return { question: record, created: true };
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
