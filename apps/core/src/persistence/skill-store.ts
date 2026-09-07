import { and, eq } from "drizzle-orm";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isKampakuBuiltinId } from "../agents/definitions.js";
import type { AgentStore } from "./agent-store.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import { agentSkills, skills } from "./schema.js";

export interface SkillRecord {
  slug: string;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  promptFragment: string;
  default?: boolean;
}

export class SkillStoreError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT",
  ) {
    super(message);
    this.name = "SkillStoreError";
  }
}

export class SkillStore extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  upsertSkill(skill: SkillRecord): SkillRecord {
    this.db
      .insert(skills)
      .values({
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        capabilitiesJson: JSON.stringify(skill.capabilities),
        toolsJson: JSON.stringify(skill.tools),
        promptFragment: skill.promptFragment,
        isDefault: skill.default ?? false,
      })
      .onConflictDoUpdate({
        target: skills.slug,
        set: {
          name: skill.name,
          description: skill.description,
          capabilitiesJson: JSON.stringify(skill.capabilities),
          toolsJson: JSON.stringify(skill.tools),
          promptFragment: skill.promptFragment,
          isDefault: skill.default ?? false,
        },
      })
      .run();
    return skill;
  }

  listSkills(): SkillRecord[] {
    return this.db
      .select()
      .from(skills)
      .all()
      .map((row) => this.mapRow(row));
  }

  listDefaultSkills(): SkillRecord[] {
    return this.listSkills().filter((skill) => skill.default);
  }

  getSkill(slug: string): SkillRecord | undefined {
    const row = this.db.select().from(skills).where(eq(skills.slug, slug)).get();
    return row ? this.mapRow(row) : undefined;
  }

  requireSkill(slug: string): SkillRecord {
    const skill = this.getSkill(slug);
    if (!skill) {
      throw new SkillStoreError(`Skill "${slug}" not found.`, "NOT_FOUND");
    }
    return skill;
  }

  isDefaultSkill(skillSlug: string): boolean {
    return this.getSkill(skillSlug)?.default ?? false;
  }

  assignSkill(agentId: string, skillSlug: string): void {
    this.requireSkill(skillSlug);
    this.db
      .insert(agentSkills)
      .values({ agentId, skillSlug })
      .onConflictDoNothing()
      .run();
  }

  unassignSkill(agentId: string, skillSlug: string): void {
    if (this.isDefaultSkill(skillSlug)) {
      throw new SkillStoreError(`Default skill "${skillSlug}" cannot be unassigned.`, "VALIDATION");
    }
    this.db
      .delete(agentSkills)
      .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillSlug, skillSlug)))
      .run();
  }

  listAgentSkills(agentId: string): string[] {
    return this.db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.agentId, agentId))
      .all()
      .map((row) => row.skillSlug);
  }

  listAgentsForSkill(skillSlug: string): string[] {
    return this.db
      .select()
      .from(agentSkills)
      .where(eq(agentSkills.skillSlug, skillSlug))
      .all()
      .map((row) => row.agentId);
  }

  deleteSkill(slug: string): void {
    const skill = this.requireSkill(slug);
    if (skill.default) {
      throw new SkillStoreError(`Default skill "${slug}" cannot be deleted.`, "CONFLICT");
    }
    const assigned = this.listAgentsForSkill(slug);
    if (assigned.length > 0) {
      throw new SkillStoreError(
        `Skill "${slug}" is assigned to ${assigned.length} agent(s). Unassign first.`,
        "CONFLICT",
      );
    }
    this.db.delete(skills).where(eq(skills.slug, slug)).run();
  }

  renameSkill(oldSlug: string, newSlug: string): void {
    this.requireSkill(oldSlug);
    if (oldSlug === newSlug) return;

    const existing = this.getSkill(newSlug);
    if (existing) {
      throw new SkillStoreError(`Skill "${newSlug}" already exists.`, "CONFLICT");
    }

    const row = this.db.select().from(skills).where(eq(skills.slug, oldSlug)).get();
    if (!row) return;

    const assignments = this.listAgentsForSkill(oldSlug);

    this.db.delete(skills).where(eq(skills.slug, oldSlug)).run();
    this.db
      .insert(skills)
      .values({ ...row, slug: newSlug })
      .run();

    for (const agentId of assignments) {
      this.db.delete(agentSkills).where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillSlug, oldSlug))).run();
      this.db.insert(agentSkills).values({ agentId, skillSlug: newSlug }).run();
    }
  }

  getAgentCapabilities(agentId: string): string[] {
    const slugs = this.listAgentSkills(agentId);
    const caps = new Set<string>();
    for (const slug of slugs) {
      const skill = this.getSkill(slug);
      if (skill) {
        for (const cap of skill.capabilities) caps.add(cap);
      }
    }
    return [...caps];
  }

  getAgentToolNames(agentId: string): string[] {
    const slugs = this.listAgentSkills(agentId);
    const tools = new Set<string>();
    for (const slug of slugs) {
      const skill = this.getSkill(slug);
      if (skill) {
        for (const tool of skill.tools) tools.add(tool);
      }
    }
    return [...tools];
  }

  buildSkillPromptAppendix(agentId: string): string {
    return this.buildSkillsPrompt((skill) => this.listAgentSkills(agentId).includes(skill.slug));
  }

  buildDefaultSkillsPrompt(): string {
    return this.buildSkillsPrompt((skill) => skill.default === true);
  }

  buildKampakuAdvisorSkillsPrompt(): string {
    return this.buildSkillsPrompt((skill) => skill.slug.startsWith("system-"));
  }

  private buildSkillsPrompt(filter: (skill: SkillRecord) => boolean): string {
    const parts = this.listSkills()
      .filter(filter)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((skill) => skill.promptFragment.trim())
      .filter(Boolean);
    return parts.length ? `\n\n${parts.join("\n\n")}` : "";
  }

  syncDefaultSkillsForAgent(agentId: string): void {
    if (isKampakuBuiltinId(agentId)) return;
    for (const skill of this.listDefaultSkills()) {
      this.assignSkill(agentId, skill.slug);
    }
  }

  syncDefaultSkills(agentStore: AgentStore): string[] {
    const assigned: string[] = [];
    for (const agent of agentStore.listAllAgents()) {
      if (isKampakuBuiltinId(agent.id)) continue;
      const before = new Set(this.listAgentSkills(agent.id));
      this.syncDefaultSkillsForAgent(agent.id);
      for (const skill of this.listDefaultSkills()) {
        if (!before.has(skill.slug)) assigned.push(`${agent.slug}:${skill.slug}`);
      }
    }
    return assigned;
  }

  private mapRow(row: typeof skills.$inferSelect): SkillRecord {
    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      capabilities: JSON.parse(row.capabilitiesJson) as string[],
      tools: JSON.parse(row.toolsJson) as string[],
      promptFragment: row.promptFragment,
      default: row.isDefault ?? false,
    };
  }
}

export function seedSkillsFromCatalog(skillStore: SkillStore, workspaceRoot: string): number {
  const catalogDir = join(workspaceRoot, "packages/contracts", "skills");
  if (!existsSync(catalogDir)) return 0;

  let count = 0;
  for (const file of readdirSync(catalogDir)) {
    if (!file.endsWith(".json")) continue;
    const raw = readFileSync(join(catalogDir, file), "utf8");
    const skill = JSON.parse(raw) as SkillRecord;
    skillStore.upsertSkill(skill);
    count += 1;
  }
  return count;
}

export function syncDefaultSkills(skillStore: SkillStore, agentStore: AgentStore): string[] {
  return skillStore.syncDefaultSkills(agentStore);
}
