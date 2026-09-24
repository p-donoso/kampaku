import type { SkillStore } from "../../../persistence/skill-store.js";

export interface GetSkillArgs {
  slug: string;
}

/**
 * Reads one skill in full, so a fragment left out of a prompt is still reachable.
 *
 * This is the other half of narrowing a role's prompt. The front office's resident set is seven
 * fragments ([10](../../../../../docs/roadmap/10-context-minimization.md) § *On-demand queries*), and the
 * fragments outside it are not hidden — they are one call away. Without this, dropping a fragment would
 * be a capability loss wearing the name of a context optimisation.
 *
 * Read-only, so it belongs to any role that can read anything: a lead inspecting a skill before
 * assigning it, or an agent checking what a granted skill actually requires.
 */
export function executeGetSkill(skillStore: SkillStore, args: GetSkillArgs) {
  const slug = args.slug?.trim();
  if (!slug) throw new Error("A skill slug is required.");
  const skill = skillStore.getSkill(slug);
  if (!skill) {
    throw new Error(
      `No skill "${slug}". Call list_skills for the catalog, which returns each skill's slug.`,
    );
  }
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    capabilities: skill.capabilities,
    tools: skill.tools,
    default: skill.default ?? false,
    promptFragment: skill.promptFragment.trim(),
  };
}

export const GET_SKILL_TOOL = {
  type: "function" as const,
  function: {
    name: "get_skill",
    description:
      "Read one skill in full by slug: its description, the tools it grants, and the full instructions " +
      "an agent holding it receives. Use this when you need a skill's own rules rather than a summary.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Skill slug, as returned by list_skills.",
        },
      },
      required: ["slug"],
    },
  },
};
