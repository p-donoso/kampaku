import type { AgentTreeNode } from "../../types.js";
import type { AgentStore } from "../../../persistence/agent-store.js";

function parentSlugFor(store: AgentStore, parentId: string | null): string | null {
  if (!parentId) return null;
  if (parentId === store.getKampakuAgent().id) return "kampaku";
  return store.getAgentBySlugOrId(parentId)?.slug ?? null;
}

function formatTree(nodes: AgentTreeNode[], prefix = ""): string[] {
  const lines: string[] = [];
  for (const [index, node] of nodes.entries()) {
    const isLast = index === nodes.length - 1;
    const branch = prefix ? (isLast ? "└── " : "├── ") : "";
    lines.push(`${prefix}${branch}${node.agent.slug} — ${node.agent.name}`);
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    lines.push(...formatTree(node.children, childPrefix));
  }
  return lines;
}

export function executeListAgents(store: AgentStore) {
  const agents = store.listAllAgents().map((agent) => ({
    slug: agent.slug,
    name: agent.name,
    source: agent.source,
    responsibilities: agent.responsibilities,
    parentSlug: parentSlugFor(store, agent.parentId),
  }));

  const tree = formatTree(store.buildTree());

  return { agents, tree };
}

export const LIST_AGENTS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_agents",
    description:
      "List all agents including Kampaku and generated sub-agents, with hierarchy tree and parent_slug for each agent.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};
