import type { SkillStore } from "../../../persistence/skill-store.js";

export function executeListSkills(skillStore: SkillStore) {
  return {
    skills: skillStore.listSkills().map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      capabilities: skill.capabilities,
      tools: skill.tools,
    })),
  };
}

export const LIST_SKILLS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_skills",
    description: "List all available modular skills that can be assigned to sub-agents.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};
