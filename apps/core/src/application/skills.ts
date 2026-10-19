import { z } from "zod";
import type { AgentStore } from "../persistence/agent-store.js";
import {
  deleteSkillFromCatalog,
  renameSkillInCatalog,
  writeSkillToCatalog,
} from "../persistence/skill-catalog.js";
import {
  SkillStore,
  SkillStoreError,
  type SkillRecord,
} from "../persistence/skill-store.js";
import type { Store } from "../persistence/store.js";

export { SkillStoreError };

const skillSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/,
      "slug must use lowercase letters, numbers, and single hyphens",
    ),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).max(1024),
  capabilities: z.array(z.string()).refine((arr) => new Set(arr).size === arr.length, "capabilities must be unique"),
  tools: z.array(z.string()).refine((arr) => new Set(arr).size === arr.length, "tools must be unique"),
  promptFragment: z.string().refine((value) => value.trim().length > 0, "instructions are required"),
  default: z.boolean().optional(),
});

export type SkillWithAssignments = SkillRecord & { assignedAgentSlugs: string[] };

function resolveAgentSlugs(agentStore: AgentStore, agentIds: string[]): string[] {
  return agentIds
    .map((id) => agentStore.getAgentBySlugOrId(id)?.slug)
    .filter((slug): slug is string => Boolean(slug));
}

function enrichSkill(
  skill: SkillRecord,
  skillStore: SkillStore,
  agentStore: AgentStore,
): SkillWithAssignments {
  const agentIds = skillStore.listAgentsForSkill(skill.slug);
  return {
    ...skill,
    assignedAgentSlugs: resolveAgentSlugs(agentStore, agentIds),
  };
}

export function listSkills(
  skillStore: SkillStore,
  agentStore: AgentStore,
): SkillWithAssignments[] {
  return skillStore.listSkills().map((skill) => enrichSkill(skill, skillStore, agentStore));
}

export function getSkill(
  skillStore: SkillStore,
  agentStore: AgentStore,
  slug: string,
): SkillWithAssignments | undefined {
  const skill = skillStore.getSkill(slug);
  if (!skill) return undefined;
  return enrichSkill(skill, skillStore, agentStore);
}

export function createSkill(
  skillStore: SkillStore,
  agentStore: AgentStore,
  workspaceRoot: string,
  input: SkillRecord,
): SkillWithAssignments {
  if (input.projectId) {
    throw new SkillStoreError(
      "A project-scoped skill is not a catalog file: author it with createProjectSkill, which records " +
        "the project it belongs to instead of writing it into the platform's own catalog.",
      "VALIDATION",
    );
  }
  const parsed = skillSchema.parse(input);
  if (skillStore.getSkill(parsed.slug)) {
    throw new SkillStoreError(`Skill "${parsed.slug}" already exists.`, "CONFLICT");
  }
  writeSkillToCatalog(workspaceRoot, parsed);
  skillStore.upsertSkill(parsed);
  return enrichSkill(parsed, skillStore, agentStore);
}

/**
 * Authors a capability **for one project**, through the runtime, as a row and not a catalog file.
 *
 * This is the mechanism BOARD F-022 was missing. The seed catalog is the platform's own vocabulary and
 * `packages/contracts/skills/<slug>/SKILL.md` is where that vocabulary is written down; a capability a
 * single project needs is not, and writing it there had two costs at once — it dirtied the platform's
 * repository from a chat turn, and the next boot re-seeded it for every project, which is what made
 * every capability global.
 *
 * Three rules, and each closes a way this could quietly become the thing it replaces:
 *
 * - **It names its project**, and the project must exist. A skill scoped to nothing is a seed skill.
 * - **It is never a default.** A default is assigned to every seat on bootstrap, so a project's
 *   capability marked default would be precisely the taxonomy this escapes.
 * - **Its slug is catalog-wide.** `agent_skills.skill_slug` is one string in the read shape of every
 *   surface, so identity stays one string; a second project wanting the same capability names its own.
 */
export function createProjectSkill(
  skillStore: SkillStore,
  agentStore: AgentStore,
  store: Store,
  projectSlugOrId: string,
  input: Omit<SkillRecord, "projectId" | "projectSlug">,
): SkillWithAssignments {
  const project = store.getProjectByIdOrSlug(projectSlugOrId);
  if (!project) {
    throw new SkillStoreError(
      `Project "${projectSlugOrId}" not found, so the skill was not authored. A project-scoped skill ` +
        "names the project it is for; a capability for every project is a seed skill.",
      "NOT_FOUND",
    );
  }
  if (input.default) {
    throw new SkillStoreError(
      "A project-scoped skill cannot be a default. A default is assigned to every seat on bootstrap, " +
        "so it would be published to every project — author it without `default`.",
      "VALIDATION",
    );
  }

  const existing = skillStore.getSkill(input.slug);
  if (existing) {
    throw new SkillStoreError(
      `Skill "${input.slug}" already exists` +
        (existing.projectId
          ? `, scoped to project "${existing.projectSlug ?? existing.projectId}".`
          : " in the seed catalog."),
      "CONFLICT",
    );
  }

  const parsed = skillSchema.parse({ ...input, default: undefined });
  const record: SkillRecord = { ...parsed, projectId: project.id };
  skillStore.upsertSkill(record);
  return enrichSkill(record, skillStore, agentStore);
}

export function updateSkill(
  skillStore: SkillStore,
  agentStore: AgentStore,
  workspaceRoot: string,
  slug: string,
  input: Partial<SkillRecord>,
): SkillWithAssignments {
  const existing = skillStore.getSkill(slug);
  if (!existing) {
    throw new SkillStoreError(`Skill "${slug}" not found.`, "NOT_FOUND");
  }

  const merged: SkillRecord = {
    slug: input.slug ?? existing.slug,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    capabilities: input.capabilities ?? existing.capabilities,
    tools: input.tools ?? existing.tools,
    promptFragment: input.promptFragment ?? existing.promptFragment,
    default: input.default ?? existing.default,
  };

  const parsed = skillSchema.parse(merged);

  if (parsed.slug !== slug) {
    skillStore.renameSkill(slug, parsed.slug);
    if (!existing.projectId) renameSkillInCatalog(workspaceRoot, slug, parsed.slug);
  }

  // A project-scoped skill has no catalog file to keep in step: editing it edits the row the project
  // authored, which is the whole difference between a seed set and a taxonomy.
  if (!existing.projectId) writeSkillToCatalog(workspaceRoot, parsed);
  const scoped: SkillRecord = { ...parsed, projectId: existing.projectId ?? null };
  skillStore.upsertSkill(scoped);
  return enrichSkill(scoped, skillStore, agentStore);
}

export function deleteSkill(
  skillStore: SkillStore,
  workspaceRoot: string,
  slug: string,
): void {
  const assigned = skillStore.listAgentsForSkill(slug);
  if (assigned.length > 0) {
    throw new SkillStoreError(
      `Skill "${slug}" is assigned to ${assigned.length} agent(s). Unassign first.`,
      "CONFLICT",
    );
  }
  const scoped = skillStore.getSkill(slug)?.projectId;
  skillStore.deleteSkill(slug);
  if (!scoped) deleteSkillFromCatalog(workspaceRoot, slug);
}
