import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { KAMPAKU_AGENT_ID } from "../agents/definitions.js";
import type { AgentStore } from "./agent-store.js";
import type { BlockageStore } from "./blockage-store.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import {
  blockWorkItemSubtree,
  recordPausedWorkItems,
  resumePausedWorkItems,
  type FrozenWorkItem,
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
import { matchesQuestionId, parsePendingQuestion } from "../agents/runtime/pending-question.js";

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

/**
 * The signature two asks of one decision share, so a repeat is recognisable as one.
 *
 * The ids cannot do this job. `ask_superior` mints `async-${Date.now()}`, so every attempt carries a fresh
 * id and the id-based idempotence below can never fire for it — measured 2026-09-25 in the suite-05 run,
 * where one project lead opened two gates for the same decision inside fourteen minutes and both reached
 * the operator's list (BOARD F-049).
 *
 * The signature is deliberately conservative: the tag is stripped, case and surrounding whitespace are
 * ignored, and nothing else is normalised. A paraphrase is a different signature and a new gate, which is
 * the safe direction — merging two genuinely different decisions would silently drop one — and the reason
 * the block renders the open gates to the agent as well, so a restatement is visible rather than hidden.
 */
export function questionSignature(input: {
  askedByAgentId: string;
  projectId?: string;
  question: string;
}): string {
  const parsed = parsePendingQuestion(input.question);
  const text = (parsed?.prompt ?? input.question)
    .replace(/<\/?kampaku-question>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${input.askedByAgentId}\u0000${input.projectId ?? ""}\u0000${text}`;
}

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

  /**
   * A decision this asker already has open, if it is asking the same one again.
   *
   * Only **pending** records are considered: a decision that was answered is closed, and asking it again
   * later is a new question about a new situation, which is a gate the operator should see.
   */
  findPendingDuplicate(input: {
    askedByAgentId: string;
    projectId?: string;
    question: string;
    questionId?: string;
  }): AgentQuestionRecord | undefined {
    const asker = this.agentStore.getAgentBySlugOrId(input.askedByAgentId);
    if (!asker) return undefined;
    const signature = questionSignature({ ...input, askedByAgentId: asker.id });
    return this.list("pending").find((candidate) => {
      if (candidate.askedByAgentId !== asker.id) return false;
      // The **decision** is the key, not the id. A payload id short-circuit used to sit here, and it swallowed a
      // different decision asked under a familiar id while the first was still pending — the same defect F-111
      // closed for answered records, on the half that was still open. The id stays accepted (and is honoured by
      // the record-id check in `askEmperor`) but it is a filter, never the key.
      return questionSignature(candidate) === signature;
    });
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

    // One decision, one gate. A repeat returns the open record instead of opening a second one, so the
    // operator's list stays a list of decisions rather than of attempts. See `questionSignature`.
    const duplicate = this.findPendingDuplicate(input);
    if (duplicate) return duplicate;

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
    recordPausedWorkItems(this.journalStore, this.pmStore, {
      workItemId: record.workItemId ?? "",
      projectId: record.projectId,
      refType: "question",
      refId: record.id,
      frozen: paused,
      occurredAt: record.createdAt,
    });
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
   * Idempotent by **decision**: the protocol tells the agent to re-ask with the same id, so a
   * second call returns the existing record (`created: false`) instead of duplicating it — and a
   * call that reuses an id for a different decision opens a new gate, because the id alone is not
   * a decision (see the check below and BOARD F-111).
   *
   * `created` is not decoration: a caller that renders a `<kampaku-question>` gate must read it. The
   * reply is what the operator sees, and a reply that renders a gate the store declined to open is a
   * question nothing can answer.
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

    // Idempotent across **all** statuses, not only pending — but on the **decision**, not on the id.
    //
    // Deduping against pending questions alone was a real defect, and it created an endless loop in the
    // probe: an agent that repeats the same question every turn — which it does, since it cannot see that
    // it already asked — had each repetition persisted as a *new* pending question as soon as the
    // previous one was answered. The pending count never reached zero, the agent read that count as a
    // blocker on its own planning, refused to plan, repeated the question, and looped. Measured: four
    // consecutive turns citing a blocker whose only source was the agent's own repeated question.
    //
    // The requirement stands; the key it was implemented with does not. This check compared the id and
    // nothing else, and the id is chosen by the model — so a **new decision** that re-used a familiar id was
    // swallowed whole. Measured 2026-10-19 on suite 03's run `s03r3`: `p0-infra` asked
    // `<kampaku-question id="s3-infra-docs-station">` and the emperor answered it through the web UI; the
    // next turn asked a different decision under the same id, `askEmperor` returned the answered record as
    // `created: false`, and `GET /api/v1/questions` held one record while the reply the operator read
    // carried a `required: true` gate that no surface held (BOARD F-111). Same shape twice more in that run.
    //
    // So the id is a **filter**, and `questionSignature` (asker + project + normalised prompt) is the key: a
    // re-ask of the same decision is still one gate, and a reused id carrying a different decision is a new
    // gate. The stale-id case is the one that has to be recorded twice here — an id that means two decisions
    // is not a question the store can answer by returning the older one.
<<<<<<< Updated upstream
    // A payload id that **is an existing question record's id** is that record's gate, not a new decision.
    //
    // Measured 2026-10-21 on suite 10's run `s10r1`: the platform's own gate list hands the operator (and the
    // durable-state block hands the agent) the **record** id, so a re-ask that follows the protocol's own
    // instruction — "re-ask with the same id" — re-uses that uuid. It arrived here with a reworded prompt, so
    // neither the id+signature check below nor `findPendingDuplicate` recognised it, and a second pending
    // record was opened for one decision: `GET /api/v1/questions` held two, the landing page rendered two
    // cards for it, and the newer card carried the older record's id as its payload id — an operator answering
    // it was answering a gate that was labelled by another. That is BOARD F-081's relay duplicate, measured
    // from the side that opens it.
    //
    // The check is deliberately narrower than "reuse the id": F-111 says a *payload* id is the model's to
    // invent and re-using one for a different decision must open a new gate. A record id is not invented — it
    // can only be learned from a surface that is already showing that gate — so resolving it back to its
    // record can never swallow a decision nobody has seen.
    if (input.questionId) {
      const addressed = this.get(input.questionId);
      if (addressed) return { question: addressed, created: false };
    }

    if (input.questionId) {
=======
    if (input.questionId) {
>>>>>>> Stashed changes
      const signature = questionSignature({ ...input, askedByAgentId: asker.id });
      const existing = this.list().find(
        (candidate) =>
          matchesQuestionId(candidate.question, input.questionId as string) &&
          questionSignature(candidate) === signature,
      );
      if (existing) return { question: existing, created: false };
    }

    // And the same decision asked again under a fresh id — which is what `ask_superior` does by
    // construction, since it mints `async-${Date.now()}`. The signature is what recognises it.
    const duplicate = this.findPendingDuplicate(input);
    if (duplicate) return { question: duplicate, created: false };

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
    recordPausedWorkItems(this.journalStore, this.pmStore, {
      workItemId: record.workItemId ?? "",
      projectId: record.projectId,
      refType: "question",
      refId: record.id,
      frozen: paused,
      occurredAt: record.createdAt,
    });
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

  /**
   * Pending questions that name **no** project.
   *
   * They exist, the operator can answer them, and until this existed no project's execution gate could see
   * them: the gate counts by `projectId`, and a decision taken in a conversation with no project attached
   * grouped under `null` and was dropped on the floor. Measured 2026-10-19 on suite 05's run `s05r3`: the
   * intake turn asked *"How should the intent-demo plan be released once you are satisfied with it?"* in a
   * conversation with no project, and the next turn's `Start now` queued two jobs with that gate still
   * pending.
   *
   * A gate nobody can attribute is not a gate that does not apply — it is one that applies and is invisible.
   */
  listPendingUnscoped(): AgentQuestionRecord[] {
    return this.list("pending").filter((question) => !question.projectId);
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
    this.resumeWorkItemIfClear(question.workItemId, question.workItemStatusBeforePause, question.id);
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

  private resumeWorkItemIfClear(workItemId?: string, fallback?: WorkItemStatus, questionId?: string): void {
    const sources: EscalationSource[] = [this];
    if (this.blockageStore) sources.push(this.blockageStore);
    resumeWorkItemIfClear(this.pmStore, sources, workItemId, fallback);
    // And everything the question froze under the item it named: a freeze is a set, and clearing it resumes
    // the set (BOARD F-089).
    if (questionId) {
      resumePausedWorkItems(this.pmStore, this.journalStore, sources, "question", questionId);
    }
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
