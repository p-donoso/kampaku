import type {
  ProjectHealth,
  ProjectRosterEntry,
  ProjectRosterTaskNode,
  ProjectRosterTreeNode,
} from "@/lib/types";

export type ProjectFilter = "all" | ProjectHealth | "questions" | "stale";

export type ProjectSortKey =
  | "health"
  | "progress"
  | "activeTasks"
  | "pendingQuestions"
  | "lastActivity"
  | "name";

export type ProjectRowKind = "project" | "task";

export type VisibleProjectRow = {
  kind: ProjectRowKind;
  key: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  projectSlug: string;
  project?: ProjectRosterEntry;
  projectTasks?: ProjectRosterTaskNode[];
  task?: ProjectRosterTaskNode;
};

const HEALTH_ORDER: Record<ProjectHealth, number> = {
  attention: 0,
  active: 1,
  idle: 2,
};

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  attention: "Requiere atención",
  active: "En ejecución",
  idle: "Inactivo",
};

export const HEALTH_DISPLAY: Record<ProjectHealth, string> = {
  attention: "Needs attention",
  active: "Running",
  idle: "Idle",
};

export function projectExpandKey(slug: string): string {
  return `p:${slug}`;
}

export function taskExpandKey(taskId: string): string {
  return `t:${taskId}`;
}

export function extractProjects(nodes: ProjectRosterTreeNode[]): ProjectRosterEntry[] {
  return nodes.map((node) => node.project);
}

export function isStale(project: ProjectRosterEntry, now = Date.now()): boolean {
  if (!project.lastActivityAt) return true;
  return now - new Date(project.lastActivityAt).getTime() > STALE_MS;
}

export function matchesFilter(
  project: ProjectRosterEntry,
  filter: ProjectFilter,
  now = Date.now(),
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "attention":
    case "active":
    case "idle":
      return project.health === filter;
    case "questions":
      return project.pendingQuestions > 0;
    case "stale":
      return isStale(project, now) && project.health !== "active";
  }
}

export function matchesSearch(project: ProjectRosterEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    project.name.toLowerCase().includes(q) ||
    project.slug.toLowerCase().includes(q) ||
    project.description.toLowerCase().includes(q) ||
    (project.projectLeadSlug?.toLowerCase().includes(q) ?? false)
  );
}

export function sortTreeNodes(
  nodes: ProjectRosterTreeNode[],
  sortKey: ProjectSortKey,
  desc: boolean,
): ProjectRosterTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    let cmp = 0;
    const pA = a.project;
    const pB = b.project;
    switch (sortKey) {
      case "health":
        cmp = HEALTH_ORDER[pA.health] - HEALTH_ORDER[pB.health];
        break;
      case "progress":
        cmp = pA.progressPct - pB.progressPct;
        break;
      case "activeTasks":
        cmp = pA.activeTasks - pB.activeTasks;
        break;
      case "pendingQuestions":
        cmp = pA.pendingQuestions - pB.pendingQuestions;
        break;
      case "lastActivity": {
        const aTime = pA.lastActivityAt ? new Date(pA.lastActivityAt).getTime() : 0;
        const bTime = pB.lastActivityAt ? new Date(pB.lastActivityAt).getTime() : 0;
        cmp = aTime - bTime;
        break;
      }
      case "name":
        cmp = pA.name.localeCompare(pB.name);
        break;
    }
    if (cmp === 0) cmp = pB.updatedAt.localeCompare(pA.updatedAt);
    return desc ? -cmp : cmp;
  });
  return sorted;
}

export function filterTreeNodes(
  nodes: ProjectRosterTreeNode[],
  filter: ProjectFilter,
  query: string,
  now = Date.now(),
): ProjectRosterTreeNode[] {
  return nodes.filter(
    (node) => matchesFilter(node.project, filter, now) && matchesSearch(node.project, query),
  );
}

export function computeFilterCounts(nodes: ProjectRosterTreeNode[], now = Date.now()) {
  const projects = extractProjects(nodes);
  return {
    total: projects.length,
    attention: projects.filter((p) => p.health === "attention").length,
    active: projects.filter((p) => p.health === "active").length,
    idle: projects.filter((p) => p.health === "idle").length,
    questions: projects.filter((p) => p.pendingQuestions > 0).length,
    stale: projects.filter((p) => isStale(p, now) && p.health !== "active").length,
  };
}

function flattenTaskRows(
  tasks: ProjectRosterTaskNode[],
  projectSlug: string,
  expanded: Set<string>,
  depth: number,
): VisibleProjectRow[] {
  const rows: VisibleProjectRow[] = [];
  for (const task of tasks) {
    const hasChildren = task.children.length > 0;
    const key = taskExpandKey(task.id);
    const isExpanded = !hasChildren || expanded.has(key);
    rows.push({
      kind: "task",
      key,
      depth,
      hasChildren,
      expanded: isExpanded,
      projectSlug,
      task,
    });
    if (hasChildren && isExpanded) {
      rows.push(...flattenTaskRows(task.children, projectSlug, expanded, depth + 1));
    }
  }
  return rows;
}

export function flattenVisibleProjectRows(
  nodes: ProjectRosterTreeNode[],
  expanded: Set<string>,
  showTree = true,
): VisibleProjectRow[] {
  const rows: VisibleProjectRow[] = [];

  for (const node of nodes) {
    const { project, tasks } = node;
    const hasChildren = showTree && tasks.length > 0;
    const pKey = projectExpandKey(project.slug);
    const pExpanded = !hasChildren || expanded.has(pKey);

    rows.push({
      kind: "project",
      key: pKey,
      depth: 0,
      hasChildren,
      expanded: pExpanded,
      projectSlug: project.slug,
      project,
      projectTasks: tasks,
    });

    if (!showTree || !hasChildren || !pExpanded) continue;
    rows.push(...flattenTaskRows(tasks, project.slug, expanded, 1));
  }

  return rows;
}

export function collectProjectExpandableKeys(nodes: ProjectRosterTreeNode[]): string[] {
  const keys: string[] = [];
  const visitTasks = (tasks: ProjectRosterTaskNode[], projectSlug: string) => {
    for (const task of tasks) {
      if (task.children.length > 0) {
        keys.push(taskExpandKey(task.id));
        visitTasks(task.children, projectSlug);
      }
    }
  };

  for (const node of nodes) {
    if (node.tasks.length > 0) {
      keys.push(projectExpandKey(node.project.slug));
      visitTasks(node.tasks, node.project.slug);
    }
  }
  return keys;
}

export function formatRelativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "no activity";
  const diff = now - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(iso));
}
