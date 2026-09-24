import { and, eq } from "drizzle-orm";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isKampakuBuiltinId } from "../agents/definitions.js";
import type { AgentStore } from "./agent-store.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import { agentSkills, skills } from "./schema.js";
import { readSkillFromCatalog } from "./skill-catalog.js";

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

  /**
   * The operator skills the orchestrator's prompt carries, named rather than filtered.
   *
   * Every `system-` fragment used to be included, which several times over gave the front office rules
   * for work it cannot do. Measured on the real catalog, four of the twelve have **zero** tools the
   * front office may call:
   *
   * | Fragment | Chars | Its tools belong to |
   * |---|---|---|
   * | `system-post-action` | 1 701 | the closing projection: `post_action_review`, `submit_completion_report`, `remember_log` |
   * | `system-global-prompt-admin` | 535 | whoever edits the global prompt |
   * | `system-skill-admin` | 922 | the skillmaster: `assign_skill`, `unassign_skill` |
   * | `system-architect` | 89 | a tool (`code-agent`) that is registered nowhere |
   *
   * That is 3 247 characters of instructions for actions this role is refused, out of 15 317 — and
   * [F-031](../../../../docs/eval/results/BOARD.md) already argues the general case for the overlaps that
   * remain.
   *
   * Naming the set instead of deriving it from the tool list is deliberate. A tool-derived filter would
   * drop `system-chat-format`, which grants no tools and is exactly what this role needs, and would keep
   * fragments whose one permitted tool is incidental to their purpose. A projection is a decision about a
   * role, so it is written down as one — which is what [10](../../../../docs/roadmap/10-context-minimization.md)
   * means by *define the default context projection for each agent role*.
   *
   * Why this is not "the defaults plus the system skills". Measured on a live run-3 instance
   * (36 seeded skills): the two groups together were **27.5 KB of a 40.4 KB turn — 68%** — and the
   * builtin orchestrator prompt that defines the front office was 11.5% of its own context. The first
   * baseline prompt that asked `what exists here?` came back with a list of skill descriptions, which
   * is what a prompt that is two-thirds about skills should be expected to produce.
   *
   * The larger share is not the problem by itself. This is: the `default` group is the eleven
   * `workflow-*` skills, and their fragments are instructions to **call tools** —
   * `execute_work_item`, `retry_work_item`, `submit_completion_report`, `report_blocker`,
   * `ask_superior`, `recall`, `remember_log`, `propose_wiki_edit`, `report_risk`, `request_handoff`,
   * `request_peer_review`, `list_allowed_folders`. Not one of them is in the front-office allowlist.
   * The front office does not execute work; it opens the container and delegates. So the orchestrator
   * was carrying ~10 KB of rules telling it to do what it is structurally forbidden from doing.
   *
   * The catalog already knew this. `syncDefaultSkillsForAgent` refuses to assign the defaults to the
   * built-in, and `sub-agent-session` builds its prompt from `buildSkillPromptAppendix(agentId)` — the
   * skills that are **assigned**. The orchestrator was the one surface that bypassed assignment and
   * took the whole catalog instead, so prompt and assignment disagreed about the same agent.
   *
   * What an executing agent gets is unchanged: sub-agents still receive the `workflow-*` fragments
   * through their assignment, which is where those instructions are true.
   */
  buildOrchestratorSkillsPrompt(): string {
    return this.buildSkillsPrompt((skill) => ORCHESTRATOR_RESIDENT_SKILLS.has(skill.slug));
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
  for (const entry of readdirSync(catalogDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = readSkillFromCatalog(workspaceRoot, entry.name);
    if (!skill) continue;
    skillStore.upsertSkill(skill);
    count += 1;
  }
  return count;
}

export function syncDefaultSkills(skillStore: SkillStore, agentStore: AgentStore): string[] {
  return skillStore.syncDefaultSkills(agentStore);
}

/**
 * What the front office's prompt carries, by slug.
 *
 * Each entry is here because the orchestrator acts on it every turn: how to answer, whether the work is
 * in scope, how to open the container, how to staff it, how to delegate it, what a plan must contain,
 * and how a change request is handled. Fragments outside this set are not deleted and not hidden — they
 * are readable on demand, which is what keeps a projection from being a loss.
 */
export const ORCHESTRATOR_RESIDENT_SKILLS: ReadonlySet<string> = new Set([
  "system-chat-format",
  "system-intake",
  "system-project-bootstrap",
  "system-agent-roster",
  "system-delegation",
  "system-plan-quality",
  "system-change-control",
]);
