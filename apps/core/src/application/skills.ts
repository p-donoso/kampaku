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
  const parsed = skillSchema.parse(input);
  if (skillStore.getSkill(parsed.slug)) {
    throw new SkillStoreError(`Skill "${parsed.slug}" already exists.`, "CONFLICT");
  }
  writeSkillToCatalog(workspaceRoot, parsed);
  skillStore.upsertSkill(parsed);
  return enrichSkill(parsed, skillStore, agentStore);
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
    renameSkillInCatalog(workspaceRoot, slug, parsed.slug);
  }

  writeSkillToCatalog(workspaceRoot, parsed);
  skillStore.upsertSkill(parsed);
  return enrichSkill(parsed, skillStore, agentStore);
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
  skillStore.deleteSkill(slug);
  deleteSkillFromCatalog(workspaceRoot, slug);
}
