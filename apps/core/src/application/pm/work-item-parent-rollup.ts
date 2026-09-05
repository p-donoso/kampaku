import { deriveParentWorkItemStatus } from "./work-item-status-rollup.js";
import type { PmStore } from "../../persistence/pm-store.js";

export function rollupParentWorkItemStatuses(pmStore: PmStore, workItemId: string): void {
  let current = pmStore.getWorkItem(workItemId);
  while (current?.parentId) {
    const parent = pmStore.getWorkItem(current.parentId);
    if (!parent) break;

    const siblings = pmStore
      .listWorkItemsByProject(parent.projectId)
      .filter((item) => item.parentId === parent.id);
    if (siblings.length === 0) break;

    const nextStatus = deriveParentWorkItemStatus(siblings.map((item) => item.status));
    if (parent.status !== nextStatus) {
      pmStore.updateWorkItem(parent.id, { status: nextStatus });
    }
    current = parent;
  }
}
