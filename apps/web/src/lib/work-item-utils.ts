import type { ProjectRosterEntry, ProjectRosterTaskNode, WorkItemRecord, WorkItemTreeNode } from "./types";

export type ProjectHealth = "attention" | "active" | "idle";

export function getProjectHealth(workItems: WorkItemTreeNode[]): ProjectHealth {
  if (countFailedItems(workItems) > 0) return "attention";
  if (countActiveExecutions(workItems) > 0) return "active";
  return "idle";
}

export function countProjectWorkItems(workItems: WorkItemTreeNode[]): { total: number; done: number; pending: number } {
  const flat = flattenWorkItems(workItems);
  const done = flat.filter((item) => item.status === "done").length;
  return { total: flat.length, done, pending: flat.length - done };
}

export function isFailedItem(item: WorkItemRecord): boolean {
  return item.status === "blocked" || item.executionPhase === "failed";
}

export function countFailedItems(items: WorkItemTreeNode[]): number {
  let count = 0;
  for (const node of items) {
    if (isFailedItem(node.item)) count++;
    count += countFailedItems(node.children);
  }
  return count;
}

export function countActiveExecutions(items: WorkItemTreeNode[]): number {
  let count = 0;
  for (const node of items) {
    if (
      node.item.executionPhase === "queued" ||
      node.item.executionPhase === "running" ||
      node.item.status === "in_progress"
    ) {
      count++;
    }
    count += countActiveExecutions(node.children);
  }
  return count;
}

export function countByStatus(items: WorkItemTreeNode[], statuses: string[]): number {
  let count = 0;
  for (const node of items) {
    if (statuses.includes(node.item.status)) count++;
    count += countByStatus(node.children, statuses);
  }
  return count;
}

export function flattenWorkItems(nodes: WorkItemTreeNode[]): WorkItemRecord[] {
  const result: WorkItemRecord[] = [];
  for (const node of nodes) {
    result.push(node.item);
    result.push(...flattenWorkItems(node.children));
  }
  return result;
}

export function buildWorkItemTree(items: WorkItemRecord[]): WorkItemTreeNode[] {
  const itemIds = new Set(items.map((item) => item.id));
  const byParent = new Map<string | null, WorkItemRecord[]>();
  for (const item of items) {
    const key = item.parentId && itemIds.has(item.parentId) ? item.parentId : null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(item);
    byParent.set(key, bucket);
  }

  const build = (parentId: string | null): WorkItemTreeNode[] => {
    const nodes = byParent.get(parentId) ?? [];
    return nodes
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          b.priority - a.priority ||
          a.title.localeCompare(b.title),
      )
      .map((item) => ({
        item,
        children: build(item.id),
      }));
  };

  return build(null);
}

export function deriveParentWorkItemStatus(childStatuses: string[]): string {
  if (childStatuses.length === 0) return "todo";
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
): string {
  if (item.status === "blocked") return "blocked";
  if (item.status === "cancelled") return "cancelled";
  if (item.status === "done") return "done";
  if (
    item.status === "in_progress" ||
    item.executionPhase === "running" ||
    item.executionPhase === "queued"
  ) {
    return "in_progress";
  }
  if (item.executionPhase === "failed") return "blocked";
  return item.status;
}

export function deriveParentExecutionPhase(
  childPhases: NonNullable<WorkItemRecord["executionPhase"]>[],
  rolledStatus: string,
): NonNullable<WorkItemRecord["executionPhase"]> {
  if (rolledStatus === "done") return "done";
  if (rolledStatus === "blocked") return "failed";
  if (childPhases.some((phase) => phase === "running")) return "running";
  if (childPhases.some((phase) => phase === "queued")) return "queued";
  if (childPhases.some((phase) => phase === "failed")) return "failed";
  if (childPhases.length > 0 && childPhases.every((phase) => phase === "done")) return "done";
  return "idle";
}

export function rollupWorkItemTree(nodes: WorkItemTreeNode[]): WorkItemTreeNode[] {
  return nodes.map((node) => {
    const children = rollupWorkItemTree(node.children);
    if (children.length === 0) {
      return { item: node.item, children };
    }

    const childStatuses = children.map((child) => effectiveWorkItemStatus(child.item));
    const status = deriveParentWorkItemStatus(childStatuses);
    const childPhases = children
      .map((child) => child.item.executionPhase ?? "idle")
      .filter((phase): phase is NonNullable<WorkItemRecord["executionPhase"]> => phase !== undefined);
    const executionPhase = deriveParentExecutionPhase(childPhases, status);

    return {
      item: {
        ...node.item,
        status,
        executionPhase,
        executionLabel:
          executionPhase === "running"
            ? "Running"
            : executionPhase === "queued"
              ? "Queued"
              : executionPhase === "done"
                ? "Done"
                : executionPhase === "failed"
                  ? "Failed"
                  : "",
      },
      children,
    };
  });
}

export function buildWorkItemTreeWithRollup(items: WorkItemRecord[]): WorkItemTreeNode[] {
  return rollupWorkItemTree(buildWorkItemTree(items));
}

export function collectRosterLeaves(tasks: ProjectRosterTaskNode[]): ProjectRosterTaskNode[] {
  const result: ProjectRosterTaskNode[] = [];
  for (const task of tasks) {
    if (task.children.length === 0) {
      result.push(task);
    } else {
      result.push(...collectRosterLeaves(task.children));
    }
  }
  return result;
}

export function hasPendingExecutableTask(tasks: ProjectRosterTaskNode[]): boolean {
  const leaves = collectRosterLeaves(tasks);
  if (leaves.some((leaf) => leaf.status === "in_progress" || leaf.executionPhase === "queued" || leaf.executionPhase === "running")) {
    return false;
  }

  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    if (leaf.status === "done" || leaf.status === "cancelled" || leaf.status === "blocked") continue;
    for (let j = 0; j < i; j++) {
      if (leaves[j].status !== "done") return false;
    }
    return true;
  }

  return false;
}

export function canPlayProject(project: ProjectRosterEntry, tasks: ProjectRosterTaskNode[]): boolean {
  if (project.doneTasks >= project.totalTasks || project.totalTasks === 0) return false;
  if (project.executionGated && project.executionGateReason === "blocked_task") return true;
  if (project.autoExecute) return false;
  if (project.executionGated) return true;
  return hasPendingExecutableTask(tasks) || project.activeTasks > 0;
}

export function canRetryWorkItem(item: WorkItemRecord): boolean {
  return item.status === "blocked";
}

export function canRetryWorkItemInTree(node: WorkItemTreeNode): boolean {
  if (node.children.length > 0) return false;
  return canRetryWorkItem(node.item);
}

export function canPauseProject(project: ProjectRosterEntry): boolean {
  return project.autoExecute;
}

export function projectExecutionGateLabel(project: ProjectRosterEntry): string | null {
  if (!project.executionGated) return null;
  if (project.executionGateReason === "pending_questions") {
    return project.executionGateDetail ?? "Pending questions";
  }
  if (project.executionGateReason === "pending_blockers") {
    return project.executionGateDetail ?? "Pending blockers";
  }
  if (project.executionGateReason === "blocked_task") {
    return project.executionGateDetail ? `Blocked: ${project.executionGateDetail}` : "Blocked task";
  }
  return project.executionGateDetail ?? "Waiting";
}

export function canExecuteWorkItemInTree(
  node: WorkItemTreeNode,
  roots: WorkItemTreeNode[],
): boolean {
  if (node.children.length > 0) return false;
  const item = node.item;
  if (item.status === "done" || item.status === "cancelled" || item.status === "in_progress" || item.status === "blocked") {
    return false;
  }
  if (item.executionPhase === "queued" || item.executionPhase === "running") {
    return false;
  }

  const flat = flattenWorkItems(roots);
  const leaves = collectLeavesFromTree(roots);
  const index = leaves.findIndex((leaf) => leaf.item.id === item.id);
  if (index <= 0) return true;
  for (let i = 0; i < index; i++) {
    if (leaves[i].item.status !== "done") return false;
  }

  const doneTitles = new Set(flat.filter((wi) => wi.status === "done").map((wi) => wi.title));
  if (item.dependsOn?.length) {
    if (!item.dependsOn.every((dep) => doneTitles.has(dep))) return false;
  }

  return true;
}

function collectLeavesFromTree(nodes: WorkItemTreeNode[]): WorkItemTreeNode[] {
  const result: WorkItemTreeNode[] = [];
  for (const node of nodes) {
    if (node.children.length === 0) {
      result.push(node);
    } else {
      result.push(...collectLeavesFromTree(node.children));
    }
  }
  return result;
}

export type VisibleWorkItemRow = {
  key: string;
  node: WorkItemTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
};

export function collectExpandableWorkItemIds(nodes: WorkItemTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.push(node.item.id);
      ids.push(...collectExpandableWorkItemIds(node.children));
    }
  }
  return ids;
}

export function flattenVisibleWorkItemRows(
  nodes: WorkItemTreeNode[],
  expandedKeys: Set<string>,
  depth = 0,
): VisibleWorkItemRow[] {
  const rows: VisibleWorkItemRow[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const expanded = expandedKeys.has(node.item.id);
    rows.push({
      key: node.item.id,
      node,
      depth,
      hasChildren,
      expanded,
    });
    if (hasChildren && expanded) {
      rows.push(...flattenVisibleWorkItemRows(node.children, expandedKeys, depth + 1));
    }
  }
  return rows;
}

export function countDoneLeaves(nodes: WorkItemTreeNode[]): { done: number; total: number } {
  const leaves = collectLeavesFromTree(nodes);
  const done = leaves.filter((leaf) => leaf.item.status === "done").length;
  return { done, total: leaves.length };
}

function rowBorderClass(node: WorkItemTreeNode): string {
  const item = node.item;
  if (item.status === "blocked" || item.executionPhase === "failed") return "border-l-red-500";
  if (item.executionPhase === "running" || item.executionPhase === "queued") return "border-l-blue-500";
  if (item.status === "done") return "border-l-emerald-600";
  if (node.children.length > 0) return "border-l-zinc-600";
  return "border-l-zinc-700";
}

export { rowBorderClass as workItemRowBorderClass };
