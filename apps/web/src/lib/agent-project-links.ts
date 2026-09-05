import type { AgentDashboard, AgentRecord, AgentTreeNode, ProjectOverview, WorkItemTreeNode } from "@/lib/types";

export function flattenAgentTree(tree: AgentTreeNode[]): AgentRecord[] {
  const agents: AgentRecord[] = [];
  for (const node of tree) {
    agents.push(node.agent);
    agents.push(...flattenAgentTree(node.children));
  }
  return agents;
}

export type ProjectAgentEntry = {
  agent: AgentRecord;
  role: "lead" | "assignee";
  taskCount: number;
};

export function collectProjectAgents(
  overview: ProjectOverview,
  agentsById: Map<string, AgentRecord>,
): ProjectAgentEntry[] {
  const entries = new Map<string, ProjectAgentEntry>();
  const leadId = overview.project.projectLeadAgentId;

  if (leadId && agentsById.has(leadId)) {
    const agent = agentsById.get(leadId)!;
    entries.set(agent.slug, { agent, role: "lead", taskCount: 0 });
  }

  function walk(nodes: WorkItemTreeNode[]) {
    for (const node of nodes) {
      const id = node.item.assigneeAgentId;
      if (id && agentsById.has(id)) {
        const agent = agentsById.get(id)!;
        const existing = entries.get(agent.slug);
        const role = leadId === id ? "lead" : "assignee";
        if (existing) {
          existing.taskCount += 1;
          if (role === "lead") existing.role = "lead";
        } else {
          entries.set(agent.slug, { agent, role, taskCount: 1 });
        }
      }
      walk(node.children);
    }
  }

  walk(overview.workItems);

  return [...entries.values()].sort((a, b) => {
    if (a.role === "lead") return -1;
    if (b.role === "lead") return 1;
    return b.taskCount - a.taskCount;
  });
}

export type AgentProjectEntry = {
  slug: string;
  name: string;
  tasks: Array<{ id: string; title: string; status: string }>;
};

export function collectAgentProjects(dashboard: AgentDashboard | null): AgentProjectEntry[] {
  if (!dashboard) return [];

  const projects = new Map<string, AgentProjectEntry>();
  for (const items of Object.values(dashboard.byStatus)) {
    for (const item of items) {
      const existing = projects.get(item.projectSlug);
      const task = { id: item.id, title: item.title, status: item.status };
      if (existing) {
        existing.tasks.push(task);
      } else {
        projects.set(item.projectSlug, {
          slug: item.projectSlug,
          name: item.projectName,
          tasks: [task],
        });
      }
    }
  }

  return [...projects.values()].sort((a, b) => b.tasks.length - a.tasks.length);
}
