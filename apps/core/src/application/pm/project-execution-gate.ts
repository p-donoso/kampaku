import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import { collectLeavesInOrder } from "./work-item-order.js";

export type ProjectExecutionGateReason =
  | "pending_questions"
  | "pending_blockers"
  | "blocked_task";

export interface ProjectExecutionGate {
  gated: boolean;
  reason?: ProjectExecutionGateReason;
  detail?: string;
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

export function getProjectExecutionGate(
  pmStore: PmStore,
  projectId: string,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): ProjectExecutionGate {
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
    return {
      gated: true,
      reason: "pending_blockers",
      detail: `${pendingBlockers} pending blocker${pendingBlockers === 1 ? "" : "s"}`,
    };
  }

  const blockingTask = findHeadBlockingWorkItem(pmStore, projectId);
  if (blockingTask) {
    return {
      gated: true,
      reason: "blocked_task",
      detail: blockingTask.title,
    };
  }

  return { gated: false };
}
