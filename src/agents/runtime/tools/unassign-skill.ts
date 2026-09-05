import type { AgentStore } from "../../../persistence/agent-store.js";
import type { SkillStore } from "../../../persistence/skill-store.js";

export interface UnassignSkillArgs {
  agent_slug: string;
  skill_slug: string;
}

export function executeUnassignSkill(
  agentStore: AgentStore,
  skillStore: SkillStore,
  args: UnassignSkillArgs,
) {
  const agent = agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) {
    throw new Error(`Agent "${args.agent_slug}" not found.`);
  }

  skillStore.unassignSkill(agent.id, args.skill_slug);

  return {
    agent_slug: agent.slug,
    skill_slug: args.skill_slug,
    skills: skillStore.listAgentSkills(agent.id),
  };
}

export const UNASSIGN_SKILL_TOOL = {
  type: "function" as const,
  function: {
    name: "unassign_skill",
    description: "Remove a modular skill from a sub-agent.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: {
          type: "string",
          description: "Target sub-agent slug.",
        },
        skill_slug: {
          type: "string",
          description: "Skill slug to remove.",
        },
      },
      required: ["agent_slug", "skill_slug"],
    },
  },
};
