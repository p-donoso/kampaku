import type { AgentStore } from "../../../persistence/agent-store.js";
import type { SkillStore } from "../../../persistence/skill-store.js";
import { SkillStoreError } from "../../../persistence/skill-store.js";

export interface AssignSkillArgs {
  agent_slug: string;
  skill_slug: string;
}

export function executeAssignSkill(
  agentStore: AgentStore,
  skillStore: SkillStore,
  args: AssignSkillArgs,
) {
  const agent = agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) {
    throw new Error(`Agent "${args.agent_slug}" not found.`);
  }
  if (agent.slug === "kampaku") {
    throw new Error("Cannot assign skills to the built-in Kampaku agent.");
  }

  try {
    skillStore.assignSkill(agent.id, args.skill_slug);
  } catch (error) {
    if (error instanceof SkillStoreError) {
      throw new Error(error.message);
    }
    throw error;
  }

  return {
    agent_slug: agent.slug,
    skill_slug: args.skill_slug,
    skills: skillStore.listAgentSkills(agent.id),
  };
}

export const ASSIGN_SKILL_TOOL = {
  type: "function" as const,
  function: {
    name: "assign_skill",
    description: "Assign a modular skill to a sub-agent. Skills define capabilities and prompt fragments.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: {
          type: "string",
          description: "Target sub-agent slug.",
        },
        skill_slug: {
          type: "string",
          description: "Skill slug from list_skills.",
        },
      },
      required: ["agent_slug", "skill_slug"],
    },
  },
};
