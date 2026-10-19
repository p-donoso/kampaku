import type { AgentTreeNode } from "../../types.js";
import type { AgentStore } from "../../../persistence/agent-store.js";
import type { SkillStore } from "../../../persistence/skill-store.js";

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

/**
 * Every seat, with **whether its skills reach past the defaults**.
 *
 * `skills` alone cannot answer that, which is how suite 03's `s3-infra-network` came to report thirteen
 * skills and no capability for its aspect (BOARD F-022). A covered seat costs three short fields — the
 * seed and project halves of its capability — and an uncovered one carries the sentence saying so and
 * naming `create_skill`, so the degraded path is stated on the surface a reply is written from. Clean
 * rosters stay short: the note is only rendered where there is something to say.
 */
export function executeListAgents(store: AgentStore, skillStore?: SkillStore) {
  const agents = store.listAllAgents().map((agent) => {
    const capability = skillStore?.capabilityReport(agent.id);
    return {
      slug: agent.slug,
      name: agent.name,
      source: agent.source,
      responsibilities: agent.responsibilities,
      parentSlug: parentSlugFor(store, agent.parentId),
      ...(capability
        ? {
            capability: capability.covered
              ? { covered: true, seed: capability.seed, project: capability.project }
              : capability,
          }
        : {}),
    };
  });

  const tree = formatTree(store.buildTree());

  return { agents, tree };
}

export const LIST_AGENTS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_agents",
    description:
      "List all agents including Kampaku and generated sub-agents, with hierarchy tree and parent_slug for each agent. " +
      "Each agent's `capability` splits the skills it holds beyond the defaults into seed and project-authored, " +
      "and states plainly when a seat holds no capability for its station's aspect (BOARD F-022).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};
