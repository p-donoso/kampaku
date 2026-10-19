import type { SkillStore } from "../../../persistence/skill-store.js";

export interface ListSkillsArgs {
  /**
   * `summary` (the default) returns what choosing a skill requires; `full` adds the long description and
   * the tool list of each skill.
   */
  detail?: "summary" | "full";
}

/**
 * Lists the catalog, at the size the decision needs.
 *
 * Measured before this changed: answering suite 01's `what exists here?` produced a **9 575-character**
 * `list_skills` result, 62% of all tool weight in the turn, from 36 skills returning
 * `slug, name, description, capabilities, tools`. Two of those fields are what an agent choosing a skill
 * actually reads — the slug it will pass to `assign_skill`, and what the skill is for — and the other
 * two account for 5 234 of the 9 969 characters.
 *
 * The compact form is 3 589 characters, **64% smaller**, and it is not a truncation: it is the same
 * catalog without the per-skill prose and tool list that a summary does not need. `detail: "full"`
 * returns exactly what this used to return, so the omission is a default and never a loss.
 */
export function executeListSkills(skillStore: SkillStore, args: ListSkillsArgs = {}) {
  const detail = args.detail ?? "summary";
  // `project` is which project this entry belongs to, or `null` for a seed the catalog ships with
  // (BOARD F-022). One field, in both sizes: "may any project be given this, or is it already taken"
  // is the question a reader choosing a capability actually has, and answering it costs one short
  // value per row rather than the prose and tool list the summary deliberately omits.
  return {
    detail,
    skills: skillStore.listSkills().map((skill) =>
      detail === "full"
        ? {
            slug: skill.slug,
            name: skill.name,
            description: skill.description,
            capabilities: skill.capabilities,
            tools: skill.tools,
            project: skill.projectSlug ?? null,
          }
        : {
            slug: skill.slug,
            name: skill.name,
            capabilities: skill.capabilities,
            project: skill.projectSlug ?? null,
          },
    ),
  };
}

export const LIST_SKILLS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_skills",
    description:
      "List the modular skills that can be assigned to agents, as slug, name, and capabilities, plus " +
      "the project the skill belongs to (null means a seed skill any project may be given). " +
      "Pass detail: \"full\" to also get each skill's long description and the tools it grants, which " +
      "costs several times more context and is only needed when comparing skills in depth. If no skill " +
      "covers an aspect the project actually has, author one with create_skill.",
    parameters: {
      type: "object",
      properties: {
        detail: {
          type: "string",
          enum: ["summary", "full"],
          description:
            "summary (default): slug, name, capabilities. full: also description and tools per skill.",
        },
      },
    },
  },
};
