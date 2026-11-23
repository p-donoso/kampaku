import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { Store } from "../../persistence/store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import { type ClosureRefusal } from "./closure-refusal.js";
import {
  explainBlockedWorkItem,
  pendingEscalationWorkItemIds,
  type BlockedItemExplanationContext,
} from "./blocked-item-explanation.js";
import { derivedWorkItemStatuses, ownBlockWorkItemIds } from "./work-item-status-rollup.js";
import { decideWorkItemClosure, type ReconciliationContext } from "./execute-work-item.js";
import { describeBlockingRisks, listBlockingRisks } from "./risk-register.js";
import { collectLeavesInOrder } from "./work-item-order.js";
import {
  findNextBlockerTriageWorkItem,
  hasPendingBlockerForWorkItem,
} from "./blocker-triage.js";
import { findNextPhaseGateWorkItem } from "./phase-auditor-gate.js";

export type ProjectExecutionGateReason =
  | "pending_questions"
  | "pending_blockers"
  | "blocked_task"
  | "pending_phase_audit"
  | "open_high_risk";

export interface ProjectExecutionGate {
  gated: boolean;
  reason?: ProjectExecutionGateReason;
  /**
   * What the operator reads: the rule that refused, the field it read, the item it refused, and the command
   * that clears it. A list of possible causes is not a cause (BOARD F-088).
   */
  detail?: string;
  /** The refusal itself, when the gate is `blocked_task` and one could be named. */
  blocked?: ClosureRefusal;
}

/**
 * What the gate needs to name a blocking rule for an item whose refusal predates the durable record.
 *
 * Appended to the parameter list rather than inserted, like `agentStore` before it: the list is positional
 * and existing callers pass by position. Absent, the gate still names the refusal the journal holds and says
 * honestly that it has no decision for an item without one.
 */
export interface ClosureReadContext {
  store: Store;
  memoryStore?: MemoryStore;
  completionCtx?: ReconciliationContext["completionCtx"];
}

/** The argument list a caller passes to `getProjectExecutionGate`, positionally, by name. */
export interface ProjectExecutionGateInput {
  pmStore: PmStore;
  projectId: string;
  questionStore?: QuestionStore;
  blockageStore?: BlockageStore;
  journalStore?: JournalStore;
  agentStore?: AgentStore;
  closureRead?: ClosureReadContext;
}

export function findHeadBlockingWorkItem(
  pmStore: PmStore,
  projectId: string,
): WorkItemRecord | null {
  const items = pmStore.listWorkItemsByProject(projectId);
  const leaves = collectLeavesInOrder(pmStore.buildWorkItemTree(items));

  for (const leaf of leaves) {
    if (leaf.status === "done" || leaf.status === "cancelled") continue;
    if (leaf.status === "blocked") return leaf;
    return null;
  }

  return null;
}

/**
 * The gate that decides whether a project may execute, and what an operator reads when it may not.
 *
 * Takes one named argument object. It used to take seven positional parameters, appended to as each gate
 * gained a store — `agentStore` was added with a comment saying so — and by this change the list had
 * become the trap that comment was written about: reading a call site told a reviewer nothing about which
 * store sat in which position.
 */
export function getProjectExecutionGate(input: ProjectExecutionGateInput): ProjectExecutionGate {
  const { pmStore, projectId, questionStore, blockageStore, journalStore, agentStore, closureRead } =
    input;
  const pendingQuestions = questionStore?.countPendingByProject().get(projectId) ?? 0;
  if (pendingQuestions > 0) {
    return {
      gated: true,
      reason: "pending_questions",
      detail: `${pendingQuestions} pending question${pendingQuestions === 1 ? "" : "s"}`,
    };
  }

  // A pending question with **no** project is still an unanswered decision, and it is the one no project's
  // count can see — so it is the one that has to stop the line by name (BOARD F-115). Measured on suite 05's
  // `s05r3`: the release gate was asked in a conversation with no project attached, the operator had not
  // answered it, and `Start now` queued two jobs anyway.
  const unscoped = questionStore?.listPendingUnscoped() ?? [];
  if (unscoped.length > 0) {
    const named = unscoped
      .slice(0, 3)
      .map((question) => question.id.slice(0, 8))
      .join(", ");
    return {
      gated: true,
      reason: "pending_questions",
      detail:
        `${unscoped.length} pending question${unscoped.length === 1 ? "" : "s"} belong${unscoped.length === 1 ? "s" : ""} ` +
        `to no project (${named}${unscoped.length > 3 ? ", …" : ""}). An unanswered decision that names no ` +
        "container still holds the line: answer it with `kampaku questions answer <id> <choice>`, or scope the " +
        "question to a project so it stops that project only.",
    };
  }

  const pendingBlockers = blockageStore?.countPendingByProject().get(projectId) ?? 0;
  if (pendingBlockers > 0) {
    const triageReady = findNextBlockerTriageWorkItem(pmStore, blockageStore, projectId);
    if (!triageReady) {
      return {
        gated: true,
        reason: "pending_blockers",
        detail: `${pendingBlockers} pending blocker${pendingBlockers === 1 ? "" : "s"}`,
      };
    }
  }

  const phaseGate = findNextPhaseGateWorkItem(pmStore, projectId);
  if (journalStore) {
    // The same risks, read by the same code as the operator's own surface (./risk-register.ts), so the
    // sentence cannot name a different set from the one `kampaku risks list` renders.
    const blockingRisks = listBlockingRisks(journalStore, pmStore, agentStore, projectId);
    if (blockingRisks.length > 0) {
      return {
        gated: true,
        reason: "open_high_risk",
        detail: describeBlockingRisks(blockingRisks),
      };
    }
  }

  if (phaseGate?.status === "in_progress") {
    return {
      gated: true,
      reason: "pending_phase_audit",
      detail: `Awaiting auditor artifact for: ${phaseGate.title}`,
    };
  }

  const blockingTask = findHeadBlockingWorkItem(pmStore, projectId);
  if (blockingTask) {
    if (hasPendingBlockerForWorkItem(blockageStore, blockingTask.id)) {
      const triageReady = findNextBlockerTriageWorkItem(pmStore, blockageStore, projectId);
      if (triageReady) {
        return { gated: false };
      }
      return {
        gated: true,
        reason: "pending_blockers",
        detail: `Awaiting triage for blocked task: ${blockingTask.title}`,
      };
    }
    return {
      gated: true,
      reason: "blocked_task",
      ...describeBlockingTask({
        pmStore,
        journalStore,
        projectId,
        blockingTask,
        closureRead,
        blockageStore,
        questionStore,
        agentStore,
      }),
    };
  }

  return { gated: false };
}

/**
 * The sentence for a blocked work item: the refusal on record, a fresh decision when there is none, or the
 * honest statement that nothing has decided it.
 *
 * The old sentence here was the item's **title** and the project's `nextStep` said *"Task is blocked by an
 * error, pending question, or blocker."* — three causes, all three absent on the measured specimen, and no
 * way for the operator to tell which rule refused or what would clear it (BOARD F-088).
 */
function describeBlockingTask(input: {
  pmStore: PmStore;
  journalStore?: JournalStore;
  projectId: string;
  blockingTask: WorkItemRecord;
  closureRead?: ClosureReadContext;
  blockageStore?: BlockageStore;
  questionStore?: QuestionStore;
  agentStore?: AgentStore;
}): { detail: string; refusal?: ClosureRefusal } {
  const { blockingTask } = input;
  const fresh = input.closureRead
    ? (item: Pick<WorkItemRecord, "id" | "title" | "projectId">) => {
        const decision = decideWorkItemClosure(
          {
            store: input.closureRead!.store,
            pmStore: input.pmStore,
            journalStore: input.journalStore,
            memoryStore: input.closureRead!.memoryStore,
            completionCtx: input.closureRead!.completionCtx,
          },
          item.id,
        );
        if (decision.outcome === "closed") return { verdict: "would_close" as const };
        if (decision.outcome === "refused") {
          return { verdict: "refused" as const, block: decision.block };
        }
        return { verdict: "no_settled_job" as const };
      }
    : undefined;

  // The item the gate names is the head blocking **leaf** of the tree, and what stops the line may be
  // anything above it: an escalation held by the operator's own desk, a container whose child carries the
  // rule, or nothing of the item's own at all. The sentence is one answer, from one module, over the same
  // derived statuses the project page renders.
  const derived = derivedWorkItemStatuses(
    input.pmStore,
    blockingTask.projectId,
    pendingEscalationWorkItemIds({ blockageStore: input.blockageStore, questionStore: input.questionStore }),
    ownBlockWorkItemIds(input.journalStore, blockingTask.projectId),
  );
  const ctx: BlockedItemExplanationContext = {
    pmStore: input.pmStore,
    journalStore: input.journalStore,
    blockageStore: input.blockageStore,
    questionStore: input.questionStore,
    agentStore: input.agentStore,
    ...(fresh ? { fresh } : {}),
  };
  const explanation = explainBlockedWorkItem(ctx, blockingTask, input.projectId, { derived });

  return {
    detail: explanation.detail,
    ...(explanation.refusal ? { blocked: explanation.refusal } : {}),
  };
}
