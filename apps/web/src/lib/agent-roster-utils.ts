import type { AgentRosterEntry, AgentRosterNode, AgentWorkload } from "@/lib/types";

export type AgentFilter =
  | "all"
  | "busy"
  | "idle"
  | "attention"
  | "stale"
  | "learnings";

export type AgentSortKey = "workload" | "activeTasks" | "learnings" | "lastActivity";

export type VisibleAgentRow = {
  node: AgentRosterNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
};

const WORKLOAD_ORDER: Record<AgentWorkload, number> = {
  running: 0,
  queued: 1,
  attention: 2,
  idle: 3,
};

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function isStale(agent: AgentRosterEntry, now = Date.now()): boolean {
  if (!agent.lastActivityAt) return true;
  return now - new Date(agent.lastActivityAt).getTime() > STALE_MS;
}

export function isBusy(agent: AgentRosterEntry): boolean {
  return agent.workload === "running" || agent.workload === "queued";
}

export function matchesFilter(agent: AgentRosterEntry, filter: AgentFilter, now = Date.now()): boolean {
  switch (filter) {
    case "all":
      return true;
    case "busy":
      return isBusy(agent);
    case "idle":
      return agent.workload === "idle";
    case "attention":
      return agent.workload === "attention" || agent.failedTasks > 0;
    case "stale":
      return isStale(agent, now);
    case "learnings":
      return agent.memoryCounts.learnings > 0;
  }
}

export function nodeMatchesSearch(node: AgentRosterNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { agent } = node;
  return (
    agent.name.toLowerCase().includes(q) ||
    agent.slug.toLowerCase().includes(q) ||
    agent.responsibilities.toLowerCase().includes(q) ||
    agent.skills.some((s) => s.toLowerCase().includes(q))
  );
}

export function subtreeMatchesFilter(
  node: AgentRosterNode,
  filter: AgentFilter,
  query: string,
  now = Date.now(),
): boolean {
  const selfMatch =
    matchesFilter(node.agent, filter, now) && nodeMatchesSearch(node, query);
  if (selfMatch) return true;
  return node.children.some((child) => subtreeMatchesFilter(child, filter, query, now));
}

export function sortSiblingNodes(nodes: AgentRosterNode[], sortKey: AgentSortKey, desc: boolean): AgentRosterNode[] {
  const sorted = [...nodes].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "workload":
        cmp = WORKLOAD_ORDER[a.agent.workload] - WORKLOAD_ORDER[b.agent.workload];
        break;
      case "activeTasks":
        cmp = a.agent.activeTasks - b.agent.activeTasks;
        break;
      case "learnings":
        cmp = a.agent.memoryCounts.learnings - b.agent.memoryCounts.learnings;
        break;
      case "lastActivity": {
        const aTime = a.agent.lastActivityAt ? new Date(a.agent.lastActivityAt).getTime() : 0;
        const bTime = b.agent.lastActivityAt ? new Date(b.agent.lastActivityAt).getTime() : 0;
        cmp = aTime - bTime;
        break;
      }
    }
    if (cmp === 0) cmp = a.agent.name.localeCompare(b.agent.name);
    return desc ? -cmp : cmp;
  });
  return sorted.map((node) => ({
    ...node,
    children: sortSiblingNodes(node.children, sortKey, desc),
  }));
}

export function filterTree(
  nodes: AgentRosterNode[],
  filter: AgentFilter,
  query: string,
  now = Date.now(),
): AgentRosterNode[] {
  const result: AgentRosterNode[] = [];
  for (const node of nodes) {
    if (!subtreeMatchesFilter(node, filter, query, now)) continue;
    result.push({
      ...node,
      children: filterTree(node.children, filter, query, now),
    });
  }
  return result;
}

export function collectExpandableSlugs(nodes: AgentRosterNode[]): string[] {
  const slugs: string[] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      slugs.push(node.agent.slug);
      slugs.push(...collectExpandableSlugs(node.children));
    }
  }
  return slugs;
}

export function collectAncestorSlugs(
  nodes: AgentRosterNode[],
  targetSlug: string,
  path: string[] = [],
): string[] | null {
  for (const node of nodes) {
    const nextPath = [...path, node.agent.slug];
    if (node.agent.slug === targetSlug) return path;
    const found = collectAncestorSlugs(node.children, targetSlug, nextPath);
    if (found) return found;
  }
  return null;
}

export function flattenVisibleRows(
  nodes: AgentRosterNode[],
  expanded: Set<string>,
  depth = 0,
): VisibleAgentRow[] {
  const rows: VisibleAgentRow[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isExpanded = !hasChildren || expanded.has(node.agent.slug);
    rows.push({ node, depth, hasChildren, expanded: isExpanded });
    if (hasChildren && isExpanded) {
      rows.push(...flattenVisibleRows(node.children, expanded, depth + 1));
    }
  }
  return rows;
}

export function countAgents(nodes: AgentRosterNode[]): number {
  return nodes.reduce((acc, node) => acc + 1 + countAgents(node.children), 0);
}

export function flattenAgents(nodes: AgentRosterNode[]): AgentRosterEntry[] {
  return nodes.flatMap((node) => [node.agent, ...flattenAgents(node.children)]);
}

export function computeFilterCounts(nodes: AgentRosterNode[], now = Date.now()) {
  const flat = flattenAgents(nodes);
  return {
    total: flat.length,
    busy: flat.filter((a) => isBusy(a)).length,
    idle: flat.filter((a) => a.workload === "idle").length,
    attention: flat.filter((a) => a.workload === "attention" || a.failedTasks > 0).length,
    stale: flat.filter((a) => isStale(a, now)).length,
    learnings: flat.filter((a) => a.memoryCounts.learnings > 0).length,
  };
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

export const WORKLOAD_LABELS: Record<AgentWorkload, string> = {
  running: "Running",
  queued: "Queued",
  idle: "Idle",
  attention: "Needs attention",
};

export const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  work_item: "task",
  delegation: "delegation",
  memory: "memory",
  conversation: "conversation",
};
