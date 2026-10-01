import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
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
  journalStore?: JournalStore,
  // Appended, never inserted: the parameter list is positional and existing callers pass by position.
  // The agent store is only needed to render *who* raised a blocking risk in the gate's sentence.
  agentStore?: AgentStore,
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
      detail: blockingTask.title,
    };
  }

  return { gated: false };
}
