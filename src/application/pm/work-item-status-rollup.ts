import {
  enrichWorkItemExecution,
  executionPhaseLabel,
  type ExecutionPhase,
} from "./execution-status.js";
import type { PmStore, WorkItemRecord, WorkItemStatus, WorkItemTreeNode } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";

export function deriveParentWorkItemStatus(childStatuses: WorkItemStatus[]): WorkItemStatus {
  if (childStatuses.length === 0) {
    throw new Error("deriveParentWorkItemStatus requires at least one child");
  }

  if (childStatuses.some((status) => status === "blocked")) return "blocked";
  if (childStatuses.some((status) => status === "in_progress")) return "in_progress";
  if (childStatuses.every((status) => status === "done")) return "done";
  if (childStatuses.every((status) => status === "cancelled")) return "cancelled";
  if (childStatuses.some((status) => status === "done")) return "in_progress";
  if (childStatuses.every((status) => status === "backlog")) return "backlog";
  return "todo";
}

export function effectiveWorkItemStatus(
  item: WorkItemRecord,
  executionPhase?: ExecutionPhase,
): WorkItemStatus {
  if (item.status === "blocked") return "blocked";
  if (item.status === "cancelled") return "cancelled";
  if (item.status === "done") return "done";
  if (
    item.status === "in_progress" ||
    executionPhase === "running" ||
    executionPhase === "queued"
  ) {
    return "in_progress";
  }
  if (executionPhase === "failed") return "blocked";
  return item.status;
}

export function deriveParentExecutionPhase(
  childPhases: ExecutionPhase[],
  rolledStatus: WorkItemStatus,
): ExecutionPhase {
  if (rolledStatus === "done") return "done";
  if (rolledStatus === "blocked") return "failed";
  if (childPhases.some((phase) => phase === "running")) return "running";
  if (childPhases.some((phase) => phase === "queued")) return "queued";
  if (childPhases.some((phase) => phase === "failed")) return "failed";
  if (childPhases.length > 0 && childPhases.every((phase) => phase === "done")) return "done";
  return "idle";
}

export function subtreeHasPendingEscalation(
  node: WorkItemTreeNode,
  pendingWorkItemIds: Set<string>,
): boolean {
  if (pendingWorkItemIds.has(node.item.id)) return true;
  return node.children.some((child) => subtreeHasPendingEscalation(child, pendingWorkItemIds));
}

export function applyWorkItemStatusRollup(
  nodes: WorkItemTreeNode[],
  pendingWorkItemIds: Set<string> = new Set(),
): WorkItemTreeNode[] {
  return nodes.map((node) => {
    const children = applyWorkItemStatusRollup(node.children, pendingWorkItemIds);
    if (children.length === 0) {
      return { item: node.item, children };
    }

    const childStatuses = children.map((child) => {
      if (subtreeHasPendingEscalation(child, pendingWorkItemIds)) return "blocked";
      const phase = "executionPhase" in child.item
        ? (child.item as WorkItemRecord & { executionPhase?: ExecutionPhase }).executionPhase
        : undefined;
      return effectiveWorkItemStatus(child.item, phase);
    });

    return {
      item: {
        ...node.item,
        status: deriveParentWorkItemStatus(childStatuses),
      },
      children,
    };
  });
}

export function rollupWorkItemTreeWithExecution(
  nodes: WorkItemTreeNode[],
  store: Store,
  pendingWorkItemIds: Set<string> = new Set(),
): ExecutionWorkItemNode[] {
  return nodes.map((node) => {
    const children = rollupWorkItemTreeWithExecution(node.children, store, pendingWorkItemIds);
    let item = enrichWorkItemExecution(node.item, store);

    if (children.length > 0) {
      const childStatuses = children.map((child) => {
        if (subtreeHasPendingEscalation(child, pendingWorkItemIds)) return "blocked";
        return effectiveWorkItemStatus(child.item, child.item.executionPhase);
      });
      const status = deriveParentWorkItemStatus(childStatuses);
      const executionPhase = deriveParentExecutionPhase(
        children.map((child) => child.item.executionPhase),
        status,
      );
      item = {
        ...item,
        status,
        executionPhase,
        executionLabel: executionPhaseLabel(executionPhase),
      };
    }

    return { item, children };
  });
}

export interface ExecutionWorkItemNode {
  item: WorkItemRecord & { executionPhase: ExecutionPhase; executionLabel: string };
  children: ExecutionWorkItemNode[];
}

export function buildPendingEscalationWorkItemIds(
  pendingRecords: Array<{ workItemId?: string }>,
): Set<string> {
  const ids = new Set<string>();
  for (const record of pendingRecords) {
    if (record.workItemId) ids.add(record.workItemId);
  }
  return ids;
}

export function rollupProjectWorkItems(
  pmStore: PmStore,
  store: Store,
  projectId: string,
  pendingWorkItemIds: Set<string> = new Set(),
): ReturnType<typeof rollupWorkItemTreeWithExecution> {
  const tree = pmStore.buildWorkItemTree(pmStore.listWorkItemsByProject(projectId));
  return rollupWorkItemTreeWithExecution(tree, store, pendingWorkItemIds);
}
