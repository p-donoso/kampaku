import { and, eq } from "drizzle-orm";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isKampakuBuiltinId } from "../agents/definitions.js";
import type { AgentStore } from "./agent-store.js";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import { agentSkills, agents, projects, skills } from "./schema.js";
import { readSkillFromCatalog } from "./skill-catalog.js";

export interface SkillRecord {
  slug: string;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  promptFragment: string;
  default?: boolean;
  /**
   * The project this capability belongs to, or absent/null for the seed catalog (BOARD F-022).
   *
   * Stored as the project's id, and exposed beside it as `projectSlug` for the surfaces that answer in
   * slugs. A scoped skill is assignable only inside its own project, is never a `default`, and is never
   * written into `packages/contracts/skills` — the seed catalog is the platform's own vocabulary, not
   * the place every project's capabilities accumulate.
   */
  projectId?: string | null;
  /** The project's slug, resolved for display. Read-only; `projectId` is what is stored. */
  projectSlug?: string | null;
}

/** How a catalog entry came to exist: shipped with the platform, or authored for one project. */
export type SkillScope = "seed" | "project";

export function skillScope(skill: Pick<SkillRecord, "projectId">): SkillScope {
  return skill.projectId ? "project" : "seed";
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
        projectId: skill.projectId ?? null,
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
          // The scope is deliberately **not** in this list. Re-seeding the catalog cannot widen a
          // project's capability into every project, and a scope is set once, at authoring, by an
          // operation that names the project it is for.
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

  /** The capabilities authored for one project. The seed catalog is not in this list. */
  listProjectSkills(projectId: string): SkillRecord[] {
    return this.listSkills().filter((skill) => skill.projectId === projectId);
  }

  /**
   * The project a seat belongs to: the nearest ancestor (itself included) that leads one.
   *
   * A station is opened under its project's lead, so the hierarchy already says which project it works
   * for — the same fact `isAgentProjectOwner` and `toolsForAgent` read from `projectLeadAgentId`. It is
   * derived here rather than stored on the agent because a seat's project is not a second field that
   * can disagree with the lead it reports to.
   */
  projectForAgent(agentId: string): { id: string; slug: string } | null {
    const seen = new Set<string>();
    let current:
      | { id: string; parentId: string | null }
      | undefined = this.db
      .select({ id: agents.id, parentId: agents.parentId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const project = this.db
        .select()
        .from(projects)
        .where(eq(projects.projectLeadAgentId, current.id))
        .get();
      if (project) return { id: project.id, slug: project.slug ?? project.id.slice(0, 8) };
      current = current.parentId
        ? this.db
            .select({ id: agents.id, parentId: agents.parentId })
            .from(agents)
            .where(eq(agents.id, current.parentId))
            .get()
        : undefined;
    }
    return null;
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

  /**
   * Gives a seat a capability — and refuses one scoped to a project the seat does not work for.
   *
   * The refusal lives here, where the grant is made, rather than in a filter on the read side. A
   * capability that a surface hides but the store still grants is not scoped: it is a row waiting for
   * the next caller that reads `agent_skills` directly. Measured on BOARD F-022: a Terraform-aspect
   * station in one project held only the thirteen defaults while the catalog held nothing for its
   * aspect, and there was nowhere to put a capability that only that project needed.
   */
  assignSkill(agentId: string, skillSlug: string): void {
    const skill = this.requireSkill(skillSlug);
    if (skill.projectId) {
      const owner = this.db
        .select()
        .from(projects)
        .where(eq(projects.id, skill.projectId))
        .get();
      const ownerSlug = owner ? (owner.slug ?? owner.id.slice(0, 8)) : skill.projectId;
      const seatProject = this.projectForAgent(agentId);
      if (seatProject?.id !== skill.projectId) {
        throw new SkillStoreError(
          `Skill "${skillSlug}" is scoped to project "${ownerSlug}", and this seat belongs to ` +
            `${seatProject ? `"${seatProject.slug}"` : "no project"}. A project-scoped capability is ` +
            "assignable only inside the project that authored it; author the capability the seat's own " +
            "project needs (create_skill with that project), or assign a seed skill.",
          "VALIDATION",
        );
      }
    }
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

  /**
   * What a seat can do beyond the floor every seat gets — and the sentence to say when it cannot.
   *
   * Measured on suite 03's run `s03r3`: `s3-infra-network`, the station that owns a Terraform module's
   * nested network module, held **13 skills** and every one of them was a default. A count is not a
   * capability, and nothing on any surface distinguished "this station has a skill for its aspect" from
   * "this station has the eleven `workflow-*` fragments and two `system-*` ones" — so a roster could
   * report thirteen and be capability-short, which is exactly what the turn then said in prose
   * (BOARD F-022).
   *
   * A **seed** skill is one the catalog already shipped; a **project** skill is one authored for this
   * seat's project. Neither is a default: the defaults are instructions to call `execute_work_item`,
   * `report_blocker` and `ask_superior`, which is what every seat can do and is not a capability for
   * any particular aspect.
   */
  capabilityReport(agentId: string): {
    covered: boolean;
    seed: string[];
    project: string[];
    note: string;
  } {
    const defaults = new Set(this.listDefaultSkills().map((skill) => skill.slug));
    const catalog = new Map(this.listSkills().map((skill) => [skill.slug, skill]));
    const held = this.listAgentSkills(agentId).filter((slug) => !defaults.has(slug));
    const project = held.filter((slug) => catalog.get(slug)?.projectId);
    const seed = held.filter((slug) => !catalog.get(slug)?.projectId);
    if (project.length + seed.length > 0) {
      return { covered: true, seed, project, note: "" };
    }
    return {
      covered: false,
      seed,
      project,
      note:
        `This seat holds only the ${defaults.size} default skills, so it has no capability for its ` +
        "station's aspect. Author the missing capability for its project with create_skill " +
        "(project_slug names the project; no other project may be given it) and assign its slug, or " +
        "state plainly in the reply that the seat is capability-short and what it would take. Do not " +
        "report it as covered.",
    };
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
    const projectId = row.projectId ?? null;
    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      capabilities: JSON.parse(row.capabilitiesJson) as string[],
      tools: JSON.parse(row.toolsJson) as string[],
      promptFragment: row.promptFragment,
      default: row.isDefault ?? false,
      projectId,
      projectSlug: projectId ? this.projectSlugFor(projectId) : null,
    };
  }

  private projectSlugFor(projectId: string): string | null {
    const row = this.db.select().from(projects).where(eq(projects.id, projectId)).get();
    return row ? (row.slug ?? row.id.slice(0, 8)) : null;
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
 * Each entry is here because the orchestrator acts on it **every turn**, and the admission test is now
 * sharper than "is this roughly the front office's business?":
 *
 * **A fragment is resident only if every tool it tells its reader to reach for is one the front office
 * holds.** A fragment that names a tool the reader cannot call is, at best, noise — and at worst it is
 * F-038: the resident `system-project-bootstrap` said *"when linking a repository **via**
 * `update_project`"*, and a live reply then told the operator to "add one with `update_project`". The
 * model invented nothing; it read its own prompt.
 *
 * Two fragments failed that test and were removed:
 *
 * | Fragment | Instruction it carried | Whose procedure it actually is |
 * |---|---|---|
 * | `system-plan-quality` | `call submit_intent with granularity fine`, `update_work_item status=done` | the **planner's**. It is also `kamaku-default: true`, so executors receive it through assignment and nothing is lost |
 * | `system-project-bootstrap` | `when linking a repository via update_project`, `before first execute_work_item` | the **lead's** bootstrap checklist |
 *
 * Both remain in the catalog and are one `get_skill` call away, which is what keeps a projection from
 * being a deletion. `system-agent-roster` stayed: the front office really does create the container and
 * the lead, so its first steps are the reader's — its two `update_project` mentions were **reworded** so
 * they describe what already happened rather than telling the reader to call a tool it does not hold.
 */
export const ORCHESTRATOR_RESIDENT_SKILLS: ReadonlySet<string> = new Set([
  "system-chat-format",
  "system-intake",
  "system-agent-roster",
  "system-delegation",
  "system-change-control",
]);
