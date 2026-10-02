import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { Store } from "../../persistence/store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import {
  describeBlockedItem,
  readLatestClosureRefusal,
  type ClosureRefusal,
} from "./closure-refusal.js";
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
}): { detail: string; refusal?: ClosureRefusal } {
  const { blockingTask } = input;
  const refusal = readLatestClosureRefusal(input.journalStore, blockingTask.id);
  const fresh = refusal || !input.closureRead
    ? undefined
    : (() => {
        const decision = decideWorkItemClosure(
          {
            store: input.closureRead.store,
            pmStore: input.pmStore,
            journalStore: input.journalStore,
            memoryStore: input.closureRead.memoryStore,
            completionCtx: input.closureRead.completionCtx,
          },
          blockingTask.id,
        );
        if (decision.outcome === "closed") return { verdict: "would_close" as const };
        if (decision.outcome === "refused") {
          return { verdict: "refused" as const, block: decision.block };
        }
        return { verdict: "no_settled_job" as const };
      })();

  return {
    detail: describeBlockedItem({
      workItem: blockingTask,
      refusal,
      fresh,
      projectRef: input.projectId,
    }),
    ...(refusal ? { blocked: refusal } : {}),
  };
}
