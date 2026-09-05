import type { PmStore, WorkItemRecord, WorkItemStatus } from "./pm-store.js";
import { rollupParentWorkItemStatuses } from "../application/pm/work-item-parent-rollup.js";

export interface EscalationRecord {
  workItemId?: string;
  workItemStatusBeforePause?: WorkItemStatus;
}

export interface EscalationSource {
  listPending(): EscalationRecord[];
  listAll?(): EscalationRecord[];
}

export function blockWorkItemAndDescendants(
  pmStore: PmStore,
  workItemId: string,
  projectId: string,
): WorkItemStatus | undefined {
  const workItem = pmStore.getWorkItem(workItemId);
  if (!workItem || workItem.status === "blocked") return undefined;

  const workItemStatusBeforePause = workItem.status;
  pmStore.updateWorkItem(workItem.id, { status: "blocked" });

  const allItems = pmStore.listWorkItemsByProject(projectId);
  const byParent = new Map<string, WorkItemRecord[]>();
  for (const item of allItems) {
    if (item.parentId) {
      const bucket = byParent.get(item.parentId) ?? [];
      bucket.push(item);
      byParent.set(item.parentId, bucket);
    }
  }

  const visit = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      if (child.status !== "blocked" && child.status !== "done") {
        pmStore.updateWorkItem(child.id, { status: "blocked" });
      }
      visit(child.id);
    }
  };
  visit(workItemId);

  return workItemStatusBeforePause;
}

export function countPendingEscalationsForWorkItem(
  sources: EscalationSource[],
  workItemId: string,
): number {
  let count = 0;
  for (const source of sources) {
    count += source.listPending().filter((record) => record.workItemId === workItemId).length;
  }
  return count;
}

export function findWorkItemStatusBeforePause(
  sources: EscalationSource[],
  workItemId: string,
): WorkItemStatus | undefined {
  for (const source of sources) {
    const fromPending = source
      .listPending()
      .find((record) => record.workItemId === workItemId && record.workItemStatusBeforePause);
    if (fromPending?.workItemStatusBeforePause) return fromPending.workItemStatusBeforePause;

    const fromAll = source.listAll?.().find(
      (record) => record.workItemId === workItemId && record.workItemStatusBeforePause,
    );
    if (fromAll?.workItemStatusBeforePause) return fromAll.workItemStatusBeforePause;
  }
  return undefined;
}

export function resumeWorkItemIfClear(
  pmStore: PmStore,
  sources: EscalationSource[],
  workItemId: string | undefined,
  fallback?: WorkItemStatus,
): void {
  if (!workItemId) return;
  if (countPendingEscalationsForWorkItem(sources, workItemId) > 0) return;

  const workItem = pmStore.getWorkItem(workItemId);
  if (!workItem || workItem.status !== "blocked") return;

  const original = fallback ?? findWorkItemStatusBeforePause(sources, workItemId) ?? "todo";
  const resumeStatus = original === "in_progress" ? "todo" : original;
  pmStore.updateWorkItem(workItemId, {
    status: resumeStatus,
    ...(resumeStatus === "todo" ? { goalId: undefined, jobId: undefined } : {}),
  });

  if (resumeStatus === "todo") {
    rollupParentWorkItemStatuses(pmStore, workItemId);
  }
}
