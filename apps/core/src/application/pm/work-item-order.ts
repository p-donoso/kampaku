import type { PmStore, WorkItemRecord, WorkItemTreeNode } from "../../persistence/pm-store.js";

export function collectLeavesInOrder(nodes: WorkItemTreeNode[]): WorkItemRecord[] {
  const result: WorkItemRecord[] = [];
  for (const node of nodes) {
    if (node.children.length === 0) {
      result.push(node.item);
    } else {
      result.push(...collectLeavesInOrder(node.children));
    }
  }
  return result;
}


export function dependsOnSatisfied(leaf: WorkItemRecord, items: WorkItemRecord[]): boolean {
  if (leaf.dependsOn.length === 0) return true;
  const doneTitles = new Set(items.filter((item) => item.status === "done").map((item) => item.title));
  return leaf.dependsOn.every((dep) => doneTitles.has(dep));
}

export function predecessorsComplete(
  leaf: WorkItemRecord,
  orderedLeaves: WorkItemRecord[],
): boolean {
  const index = orderedLeaves.findIndex((item) => item.id === leaf.id);
  if (index <= 0) return true;
  for (let i = 0; i < index; i++) {
    if (orderedLeaves[i].status !== "done") return false;
  }
  return true;
}

export function canExecuteLeaf(
  leaf: WorkItemRecord,
  orderedLeaves: WorkItemRecord[],
  items: WorkItemRecord[],
  pmStore: PmStore,
): { ok: true } | { ok: false; reason: string } {
  if (leaf.status === "done" || leaf.status === "cancelled") {
    return { ok: false, reason: "Task is already finished." };
  }

  if (leaf.status === "in_progress") {
    return { ok: false, reason: "Task is already executing." };
  }

  if (leaf.status === "blocked") {
    return { ok: false, reason: "Task is blocked by an error, pending question, or blocker." };
  }

  const ancestors = pmStore.getAncestors(leaf.id);
  if (ancestors.some((ancestor) => ancestor.status === "blocked")) {
    return { ok: false, reason: "A parent task is blocked by an error, question, or blocker." };
  }

  if (!predecessorsComplete(leaf, orderedLeaves)) {
    return { ok: false, reason: "Earlier tasks in the project plan must be completed first." };
  }

  if (!dependsOnSatisfied(leaf, items)) {
    return { ok: false, reason: "Dependency tasks must be completed first." };
  }

  return { ok: true };
}

export function hasActiveExecution(leaves: WorkItemRecord[]): boolean {
  return leaves.some((leaf) => leaf.status === "in_progress");
}

export function findNextExecutableWorkItem(
  pmStore: PmStore,
  projectId: string,
): WorkItemRecord | null {
  const items = pmStore.listWorkItemsByProject(projectId);
  const tree = pmStore.buildWorkItemTree(items);
  const leaves = collectLeavesInOrder(tree);

  if (hasActiveExecution(leaves)) return null;

  for (const leaf of leaves) {
    if (canExecuteLeaf(leaf, leaves, items, pmStore).ok) {
      return leaf;
    }
  }

  return null;
}

export function projectAutoExecuteKey(projectId: string): string {
  return `project_auto_execute:${projectId}`;
}
