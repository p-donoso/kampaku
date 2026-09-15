import type { AgentStore } from "../../persistence/agent-store.js";
import type { SkillStore } from "../../persistence/skill-store.js";
import type { Store } from "../../persistence/store.js";
import { slugifyName } from "../../delegator/types.js";

const PLATFORM_TEAM_SLUG_MIGRATIONS: Record<string, string> = {
  "ux-ui": "kampaku-ux-ui",
  "security-expert": "kampaku-security",
  "fullstack-dev": "kampaku-fullstack",
  qa: "kampaku-qa",
  documenter: "kampaku-documenter",
  "skills-engineer": "kampaku-skills-engineer",
  "kampaku-skills-engineer": "kampaku-skillmaster",
};

const PLATFORM_TEAM_TREE: Array<{
  slug: string;
  name: string;
  parentSlug: string;
  responsibilities: string;
  systemPrompt: string;
  skills: string[];
}> = [
  {
    slug: "kampaku-manager",
    name: "Kampaku Manager",
    parentSlug: "kampaku",
    responsibilities:
      "Lead the Kampaku self-improvement project. Coordinate UX, security, development, QA, and documentation.",
    systemPrompt:
      "You are the Kampaku Manager. You own coherence for the Kampaku platform self-improvement project. Coordinate specialists, prioritize work, validate sprint closure, and triage blockers and questions. Reject platform deliverables that lack web/CLI parity or incomplete CRUD.",
    skills: ["system-architect", "github-admin", "system-plan-quality", "system-delegation"],
  },
  {
    slug: "kampaku-ux-ui",
    name: "Kampaku UX/UI",
    parentSlug: "kampaku-manager",
    responsibilities: "User experience, interface design, and frontend usability for Kampaku.",
    systemPrompt:
      "You are the Kampaku UX/UI specialist. Design intuitive flows and accessible interfaces in apps/web. Every management screen must mirror CLI capabilities — full CRUD, no web-only or missing actions.",
    skills: ["nextjs-dev"],
  },
  {
    slug: "kampaku-security",
    name: "Kampaku Security",
    parentSlug: "kampaku-manager",
    responsibilities: "Security reviews, threat modeling, and hardening across Kampaku repositories.",
    systemPrompt:
      "You are the Kampaku security expert. Identify vulnerabilities, define secure defaults, and review changes for auth, data handling, and deployment risks. Enforce least privilege for agents, skills, tools, and endpoints.",
    skills: ["security-review"],
  },
  {
    slug: "kampaku-fullstack",
    name: "Kampaku Full Stack",
    parentSlug: "kampaku-manager",
    responsibilities:
      "Platform implementation in apps/core (API + CLI), apps/worker, and packages/contracts.",
    systemPrompt: `You are the Kampaku Full Stack developer. You implement control-plane and execution-layer code — not the web dashboard UI (delegate apps/web visual work to kampaku-ux-ui).

Architecture:
- apps/core — control plane: Hono REST API, Commander CLI, agent runtime, planner/delegator, SQLite persistence (Drizzle + better-sqlite3). Source of truth for projects, agents, work items, goals, and jobs.
- apps/worker — job executor: leases work from Core, runs code-agent tools in a sandboxed workspace, returns structured results. Does not own project truth.
- packages/contracts — shared boundaries: OpenAPI (control-plane.yaml), JSON schemas, skill catalog. Interface changes start here before implementation.
- apps/web — Next.js dashboard; UI/UX owned by kampaku-ux-ui.

Rules:
1. State transitions are durable, explicit, and auditable — persist before side effects propagate.
2. Contracts crossing repo or process boundaries live in packages/contracts.
3. Match existing layout: src/api, src/application, src/persistence, src/bootstrap, src/cli.
4. Minimal diffs; follow surrounding TypeScript conventions; tests with Vitest.
5. Web/CLI parity and complete CRUD per resource — see kampaku-platform-dev skill.

Stack: TypeScript ESM, Hono, Drizzle, better-sqlite3, Commander, Zod, Vitest. Node >= 22.`,
    skills: ["kampaku-platform-dev"],
  },
  {
    slug: "kampaku-qa",
    name: "Kampaku QA",
    parentSlug: "kampaku-manager",
    responsibilities: "Test planning, regression coverage, and quality gates for Kampaku releases.",
    systemPrompt:
      "You are the Kampaku QA specialist. Define test plans, verify acceptance criteria, and report defects. Gate releases on web/CLI parity and full CRUD coverage for each resource.",
    skills: ["qa-testing"],
  },
  {
    slug: "kampaku-documenter",
    name: "Kampaku Documenter",
    parentSlug: "kampaku-manager",
    responsibilities: "Architecture docs, ADRs, user guides, and API documentation for Kampaku.",
    systemPrompt:
      "You are the Kampaku documenter. Keep docs accurate, write ADRs, and maintain user-facing guides aligned with the codebase.",
    skills: ["docs-writer"],
  },
  {
    slug: "kampaku-skillmaster",
    name: "Kampaku Skillmaster",
    parentSlug: "kampaku-manager",
    responsibilities: "Create, maintain, and fix skills in the Kampaku catalog.",
    systemPrompt:
      "You are the Kampaku Skillmaster. Author, review, and fix Agent Skills in packages/contracts/skills/<slug>/SKILL.md. Ensure standard YAML frontmatter, clear Markdown instructions, and correct Kampaku capability/tool metadata.",
    skills: ["skill-builder"],
  },
  {
    slug: "kampaku-auditor",
    name: "Kampaku Auditor",
    parentSlug: "kampaku-manager",
    responsibilities:
      "Review agent communications, audit deliverable readiness, platform flows, and phase gates. Propose improvements to team structure, skills, and system prompts.",
    systemPrompt:
      "You are the Kampaku Auditor. Run deliverable-readiness, platform-flow, and phase-gate audits using project journals and linked repositories. Identify gaps in reporting, closure honesty, wiki sync, and repo quality. Propose concrete changes with evidence from journal entries and file paths.",
    skills: [
      "system-audit",
      "audit-deliverable-readiness",
      "audit-platform-flows",
      "audit-phase-gate",
    ],
  },
];

export const PLATFORM_TEAM_LEAD_SLUG = "kampaku-manager";

export const PLATFORM_TEAM_SKILL_ASSIGNMENTS: Record<string, string[]> = Object.fromEntries(
  PLATFORM_TEAM_TREE.map((spec) => [spec.slug, spec.skills]),
);

export function migratePlatformTeamSlugs(agentStore: AgentStore): string[] {
  const changes: string[] = [];

  for (const [oldSlug, newSlug] of Object.entries(PLATFORM_TEAM_SLUG_MIGRATIONS)) {
    const oldAgent = agentStore.getAgentBySlugOrId(oldSlug);
    const newAgent = agentStore.getAgentBySlugOrId(newSlug);
    if (!oldAgent) continue;

    if (newAgent) {
      agentStore.deleteAgent(oldSlug);
      changes.push(`removed legacy ${oldSlug}`);
      continue;
    }

    agentStore.renameAgentSlug(oldSlug, newSlug);
    changes.push(`${oldSlug} -> ${newSlug}`);
  }

  return changes;
}

export function bootstrapKampakuPlatformTeam(agentStore: AgentStore): {
  created: string[];
  existing: string[];
} {
  const created: string[] = [];
  const existing: string[] = [];

  for (const spec of PLATFORM_TEAM_TREE) {
    if (agentStore.getAgentBySlugOrId(spec.slug)) {
      existing.push(spec.slug);
      continue;
    }

    const parent = agentStore.getAgentBySlugOrId(spec.parentSlug);
    if (!parent) continue;

    agentStore.createSubAgent({
      slug: spec.slug,
      name: spec.name,
      responsibilities: spec.responsibilities,
      systemPrompt: spec.systemPrompt,
      parentId: parent.id,
      source: "bootstrap",
    });
    created.push(spec.slug);
  }

  return { created, existing };
}

export function syncPlatformTeamProfiles(agentStore: AgentStore): void {
  for (const spec of PLATFORM_TEAM_TREE) {
    const agent = agentStore.getAgentBySlugOrId(spec.slug);
    if (!agent) continue;

    agentStore.markAgentAsBootstrap(agent.id);

    agentStore.updateAgent(spec.slug, {
      name: spec.name,
      responsibilities: spec.responsibilities,
      systemPrompt: spec.systemPrompt,
    });
  }
}

export function syncPlatformTeamSkills(skillStore: SkillStore, agentStore: AgentStore): void {
  const defaultSkillSlugs = new Set(skillStore.listDefaultSkills().map((skill) => skill.slug));

  for (const [slug, desiredSkills] of Object.entries(PLATFORM_TEAM_SKILL_ASSIGNMENTS)) {
    const agent = agentStore.getAgentBySlugOrId(slug);
    if (!agent) continue;

    const available = desiredSkills.filter((skillSlug) => skillStore.getSkill(skillSlug));
    const current = new Set(skillStore.listAgentSkills(agent.id));

    for (const skillSlug of current) {
      if (defaultSkillSlugs.has(skillSlug)) continue;
      if (!available.includes(skillSlug)) {
        skillStore.unassignSkill(agent.id, skillSlug);
      }
    }

    for (const skillSlug of available) {
      skillStore.assignSkill(agent.id, skillSlug);
    }
  }
}

export function linkDefaultProjectToPlatformTeam(store: Store, agentStore: AgentStore): boolean {
  const projectId = store.getBootstrapState<{ projectId: string }>("default_project")?.projectId;
  if (!projectId) return false;

  const lead = agentStore.getAgentBySlugOrId(PLATFORM_TEAM_LEAD_SLUG);
  if (!lead) return false;

  store.updateProjectPlanning(projectId, { projectLeadAgentId: lead.id });
  return true;
}

export function createMissingAgentFromSlug(
  agentStore: AgentStore,
  slug: string,
  suggestedResponsibility?: string,
  parentSlug = "kampaku",
  skillStore?: SkillStore,
): ReturnType<AgentStore["createSubAgent"]> | undefined {
  if (agentStore.getAgentBySlugOrId(slug)) return undefined;

  const parent = agentStore.getAgentBySlugOrId(parentSlug);
  if (!parent) return undefined;

  const name = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const agent = agentStore.createSubAgent({
    slug,
    name,
    responsibilities: suggestedResponsibility ?? `Responsible for ${name} work.`,
    systemPrompt: `You are ${name}. ${suggestedResponsibility ?? `Handle tasks related to ${slug}.`}`,
    parentId: parent.id,
  });

  if (skillStore) {
    assignProjectTeamSkills(skillStore, agent.id, slug);
  }

  return agent;
}

/** Default specialist slugs for a new project team (excluding lead). */
export function defaultProjectTeamSlugs(projectSlug: string): string[] {
  return [
    `${projectSlug}-lead`,
    `${projectSlug}-frontend`,
    `${projectSlug}-backend`,
    `${projectSlug}-qa`,
    `${projectSlug}-auditor`,
  ];
}

const PROJECT_TEAM_SKILL_MAP: Array<{ suffix: string; skills: string[] }> = [
  { suffix: "-auditor", skills: ["audit-deliverable-readiness", "audit-phase-gate", "docs-writer"] },
  { suffix: "-qa", skills: ["qa-testing", "workflow-specialist-delegation"] },
  { suffix: "-frontend", skills: ["nextjs-dev", "workflow-specialist-delegation"] },
  { suffix: "-backend", skills: ["api-integration", "workflow-specialist-delegation"] },
  { suffix: "-docs", skills: ["docs-writer", "workflow-specialist-delegation"] },
  { suffix: "-documenter", skills: ["docs-writer", "workflow-specialist-delegation"] },
  { suffix: "-lead", skills: ["system-delegation", "system-plan-quality", "docs-writer", "workflow-blockers"] },
];

export function assignProjectTeamSkills(skillStore: SkillStore, agentId: string, slug: string): void {
  for (const entry of PROJECT_TEAM_SKILL_MAP) {
    if (!slug.endsWith(entry.suffix)) continue;
    for (const skillSlug of entry.skills) {
      if (skillStore.getSkill(skillSlug)) {
        skillStore.assignSkill(agentId, skillSlug);
      }
    }
    break;
  }
}

export { slugifyName };
