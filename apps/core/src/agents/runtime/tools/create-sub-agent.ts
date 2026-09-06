import type { AgentStore } from "../../../persistence/agent-store.js";
import type { SkillStore } from "../../../persistence/skill-store.js";
import type { AgentRecord } from "../../types.js";

export interface CreateSubAgentArgs {
  slug: string;
  name: string;
  responsibilities: string;
  system_prompt: string;
  parent_slug?: string;
  skill_slugs?: string[];
}

export interface CreateSubAgentResult {
  id: string;
  slug: string;
  name: string;
}

export function executeCreateSubAgent(
  store: AgentStore,
  skillStore: SkillStore,
  args: CreateSubAgentArgs,
): CreateSubAgentResult {
  const parentSlug = args.parent_slug?.trim().toLowerCase() || "kampaku";
  const parent = store.getAgentBySlugOrId(parentSlug);
  if (!parent) {
    throw new Error(`Parent agent "${parentSlug}" not found.`);
  }

  const agent = store.createSubAgent({
    slug: args.slug,
    name: args.name,
    responsibilities: args.responsibilities,
    systemPrompt: args.system_prompt.trim(),
    parentId: parent.id,
  });

  skillStore.syncDefaultSkillsForAgent(agent.id);
  for (const skillSlug of args.skill_slugs ?? []) {
    skillStore.assignSkill(agent.id, skillSlug);
  }
  const appendix = skillStore.buildSkillPromptAppendix(agent.id);
  if (appendix) {
    store.updateAgent(agent.slug, { systemPrompt: `${agent.systemPrompt}${appendix}` });
  }

  return { id: agent.id, slug: agent.slug, name: agent.name };
}

export const CREATE_SUB_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_sub_agent",
    description:
      "Create a specialized sub-agent after the emperor explicitly approved the proposal in chat. Do not call without prior approval. Default workflow skills are assigned automatically. Declare skill_slugs for the durable capabilities this agent must own. Use parent_slug to nest under another agent (default: kampaku).",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Unique identifier using lowercase letters, numbers, and hyphens.",
        },
        name: {
          type: "string",
          description: "Display name for the sub-agent.",
        },
        responsibilities: {
          type: "string",
          description: "What this sub-agent is responsible for.",
        },
        system_prompt: {
          type: "string",
          description: "Full system prompt that defines the sub-agent behavior.",
        },
        parent_slug: {
          type: "string",
          description: "Parent agent slug. Defaults to kampaku for top-level sub-agents.",
        },
        skill_slugs: {
          type: "array",
          items: { type: "string" },
          description: "Existing skill slugs required for this agent's durable responsibility.",
        },
      },
      required: ["slug", "name", "responsibilities", "system_prompt"],
    },
  },
};

export type { AgentRecord };
