import type { AgentRecord } from "../agents/types.js";
import type { AgentStore } from "../persistence/agent-store.js";
import { PLATFORM_TEAM_LEAD_SLUG } from "../application/bootstrap/kampaku-platform-team.js";

/** Slug of the self-improvement project; its team lives under kampaku-manager. */
export const PLATFORM_PROJECT_SLUG = "kampaku";

const PLATFORM_ROLE_SUFFIXES: Record<string, string[]> = {
  documenter: ["lead"],
  fullstack: ["frontend", "backend"],
  "ux-ui": ["frontend"],
  qa: ["qa"],
  auditor: ["auditor"],
  security: ["auditor"],
  manager: ["lead"],
  skillmaster: [],
};

const BACKEND_HINT_WORDS = [
  "api endpoint",
  "backend",
  "server-side",
  "ssim",
  "optimiser service",
  "vision-api",
  "vision api",
  "skill wrapper",
  "scoring function",
  "pipeline",
  "fastapi",
  "python service",
];

const FRONTEND_HINT_WORDS = [
  "frontend",
  "react",
  "vite",
  "canvas",
  "component",
  "upload ui",
  "ui control",
  "primitive tool",
  "scaffold",
  "export button",
  "export functionality",
  "byotupload",
];

/** Agents under kampaku-manager (platform self-improvement team only). */
export function getPlatformTeamAgentIds(agentStore: AgentStore): Set<string> {
  const lead = agentStore.getAgentBySlugOrId(PLATFORM_TEAM_LEAD_SLUG);
  if (!lead) return new Set();
  return new Set([lead.id, ...agentStore.getDescendantIds(lead.id)]);
}

export function isPlatformTeamAgent(agent: AgentRecord, agentStore: AgentStore): boolean {
  return getPlatformTeamAgentIds(agentStore).has(agent.id);
}

export function getProjectTeamAgentIds(
  agentStore: AgentStore,
  projectLeadSlug?: string,
): Set<string> {
  if (!projectLeadSlug) return new Set();
  const lead = agentStore.getAgentBySlugOrId(projectLeadSlug);
  if (!lead) return new Set();
  return new Set([lead.id, ...agentStore.getDescendantIds(lead.id)]);
}

export function isExternalProject(projectSlug?: string): boolean {
  return Boolean(projectSlug && projectSlug !== PLATFORM_PROJECT_SLUG);
}

/** Whether this agent may receive work items for the given project. */
export function isAgentEligibleForProject(
  agent: AgentRecord,
  projectSlug: string | undefined,
  agentStore: AgentStore,
): boolean {
  if (!isExternalProject(projectSlug)) return true;
  if (agent.slug === "kampaku") return false;
  if (isPlatformTeamAgent(agent, agentStore)) return false;
  return true;
}

function projectTeamBase(projectSlug: string, projectLeadSlug?: string): string {
  if (projectLeadSlug?.endsWith("-lead")) {
    return projectLeadSlug.slice(0, -"-lead".length);
  }
  return projectSlug;
}

function pickProjectTeamSuffix(platformSlug: string, hint: string): string | undefined {
  const role = platformSlug.replace(/^kampaku-/, "");
  const candidates = PLATFORM_ROLE_SUFFIXES[role];
  if (!candidates?.length) return undefined;
  if (candidates.length === 1) return candidates[0];

  const lower = hint.toLowerCase();
  const frontendScore = FRONTEND_HINT_WORDS.filter((word) => lower.includes(word)).length;
  const backendScore = BACKEND_HINT_WORDS.filter((word) => lower.includes(word)).length;
  if (frontendScore > backendScore) return "frontend";
  if (backendScore > frontendScore) return "backend";
  return "frontend";
}

/**
 * Map a kampaku-* platform assignee to the equivalent {project}-* slug.
 * Returns undefined when no safe mapping exists (caller should use project lead).
 */
export function remapPlatformAssigneeSlug(
  platformSlug: string,
  projectSlug: string,
  projectLeadSlug: string | undefined,
  hint: string,
): string | undefined {
  if (platformSlug === "kampaku") return projectLeadSlug;
  if (!platformSlug.startsWith("kampaku-")) return platformSlug;

  const suffix = pickProjectTeamSuffix(platformSlug, hint);
  if (!suffix) return projectLeadSlug;

  const base = projectTeamBase(projectSlug, projectLeadSlug);
  if (suffix === "lead") return `${base}-lead`;
  return `${base}-${suffix}`;
}

export function resolveExplicitAssignee(
  assigneeSlug: string,
  options: {
    projectSlug: string;
    projectLeadSlug?: string;
    hint: string;
    agentStore: AgentStore;
  },
): { agent: AgentRecord; reason: string } | undefined {
  const { projectSlug, projectLeadSlug, hint, agentStore } = options;

  let slug = assigneeSlug;
  const direct = agentStore.getAgentBySlugOrId(slug);
  if (direct && !isAgentEligibleForProject(direct, projectSlug, agentStore)) {
    slug =
      remapPlatformAssigneeSlug(slug, projectSlug, projectLeadSlug, hint) ?? projectLeadSlug ?? slug;
  }

  if (!slug) return undefined;

  const agent = agentStore.getAgentBySlugOrId(slug);
  if (!agent || !isAgentEligibleForProject(agent, projectSlug, agentStore)) {
    return undefined;
  }

  const reason =
    slug !== assigneeSlug
      ? `Remapped platform assignee ${assigneeSlug} → ${agent.slug} (external project team only)`
      : `Explicit assignee_slug: ${agent.slug}`;

  return { agent, reason };
}
