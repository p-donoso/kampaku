import type { AgentRecord } from "../agents/types.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { ModelBroker } from "../model-broker/client.js";
import type { AppConfig } from "../config.js";
import type { PlannedWorkItem } from "./types.js";

export interface MatchAgentResult {
  agent: AgentRecord;
  reason: string;
}

export interface MatchAgentOptions {
  workItem: PlannedWorkItem;
  agentStore: AgentStore;
  config: AppConfig;
  broker?: ModelBroker;
  projectLeadSlug?: string;
  intent?: string;
}

const DOMAIN_KEYWORDS: Array<{ words: string[]; slugHints: string[] }> = [
  { words: ["test", "qa", "prueba", "integración", "quality"], slugHints: ["kampaku-qa", "qa", "test"] },
  { words: ["wireframe", "mockup", "ux", "diseño", "figma", "prototipo"], slugHints: ["kampaku-ux-ui", "ui-ux", "diseno", "design"] },
  { words: ["backend", "api", "rest", "servidor", "database", "auth"], slugHints: ["kampaku-fullstack", "backend", "api"] },
  { words: ["frontend", "react", "component", "ui", "visual"], slugHints: ["kampaku-ux-ui", "frontend", "react"] },
  { words: ["requisito", "alcance", "requirement", "plan"], slugHints: ["jefe", "lead", "interfaz"] },
  { words: ["audit", "auditor", "review", "compliance", "journal", "communication"], slugHints: ["kampaku-auditor", "auditor"] },
];

function getTeamAgentIds(agentStore: AgentStore, leadSlug?: string): Set<string> {
  if (!leadSlug) return new Set();
  const lead = agentStore.getAgentBySlugOrId(leadSlug);
  if (!lead) return new Set();
  return new Set([lead.id, ...agentStore.getDescendantIds(lead.id)]);
}

function scoreAgent(
  agent: AgentRecord,
  text: string,
  agentStore: AgentStore,
  teamIds: Set<string>,
): number {
  const haystack = `${agent.name} ${agent.responsibilities} ${agent.slug}`.toLowerCase();
  const lowerText = text.toLowerCase();

  let score = 0;

  const words = lowerText.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  for (const word of words) {
    if (haystack.includes(word)) score += 1;
  }

  for (const domain of DOMAIN_KEYWORDS) {
    if (domain.words.some((w) => lowerText.includes(w))) {
      if (domain.slugHints.some((hint) => agent.slug.includes(hint))) {
        score += 3;
      }
    }
  }

  if (agentStore.isLeafAgent(agent.id)) {
    score += 1;
  }

  if (teamIds.has(agent.id)) {
    score += 2;
  }

  if (agent.slug === "kampaku") {
    score -= 5;
  }

  return score;
}

export function matchAgentStub(options: MatchAgentOptions): MatchAgentResult {
  const { workItem, agentStore, projectLeadSlug } = options;
  const agents = agentStore.listAllAgents().filter((a) => a.status === "active");
  const teamIds = getTeamAgentIds(agentStore, projectLeadSlug);

  if (workItem.assignee_slug) {
    const explicit = agentStore.getAgentBySlugOrId(workItem.assignee_slug);
    if (explicit) {
      return { agent: explicit, reason: `Explicit assignee_slug: ${explicit.slug}` };
    }
  }

  const hint = [
    workItem.title,
    workItem.description ?? "",
    workItem.suggested_responsibility ?? "",
  ].join(" ");

  let best = agentStore.getKampakuAgent();
  let bestScore = -Infinity;

  for (const agent of agents) {
    const agentScore = scoreAgent(agent, hint, agentStore, teamIds);
    if (agentScore > bestScore) {
      bestScore = agentScore;
      best = agent;
    }
  }

  if (best.slug === "kampaku") {
    const lead = projectLeadSlug
      ? agentStore.getAgentBySlugOrId(projectLeadSlug)
      : undefined;
    if (lead) {
      return {
        agent: lead,
        reason: "Fallback to project lead; no specialized leaf agent matched",
      };
    }
  }

  return {
    agent: best,
    reason:
      bestScore > 0
        ? `Matched by responsibilities overlap (score ${bestScore.toFixed(1)})`
        : "No specialized match; assigned to best available agent",
  };
}

const MATCH_BATCH_SYSTEM_PROMPT = `You are an agent router for Kampaku.
Assign each work item to the best agent slug from the list.
Rules:
- Prefer specialized leaf agents over kampaku and over generic managers
- Backend/API tasks → backend developer agents
- UI/UX/wireframe tasks → design agents
- Frontend/React tasks → frontend agents
- QA/test tasks → qa agents (may be outside project team)
- Requirements/planning → project lead agent when appropriate
- Prefer agents under the project team when listed
Respond with JSON: { "assignments": [{ "title": string, "agent_slug": string, "reason": string }] }
Include every work item title exactly once.`;

export async function matchAgentsBatch(
  workItems: PlannedWorkItem[],
  options: Omit<MatchAgentOptions, "workItem">,
): Promise<Map<string, MatchAgentResult>> {
  const results = new Map<string, MatchAgentResult>();

  for (const item of workItems) {
    if (item.assignee_slug) {
      const explicit = options.agentStore.getAgentBySlugOrId(item.assignee_slug);
      if (explicit) {
        results.set(item.title, {
          agent: explicit,
          reason: `Explicit assignee_slug: ${explicit.slug}`,
        });
      }
    }
  }

  const remaining = workItems.filter((item) => !results.has(item.title));
  if (remaining.length === 0) return results;

  if (options.config.agentMode === "stub" || !options.broker) {
    for (const item of remaining) {
      results.set(item.title, matchAgentStub({ ...options, workItem: item }));
    }
    return results;
  }

  const available = await options.broker.isAvailable();
  if (!available) {
    for (const item of remaining) {
      results.set(item.title, matchAgentStub({ ...options, workItem: item }));
    }
    return results;
  }

  try {
    const agents = options.agentStore.listAllAgents();
    const response = await options.broker.chat([
      { role: "system", content: MATCH_BATCH_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          project_lead: options.projectLeadSlug,
          intent: options.intent,
          work_items: remaining,
          agents: agents.map((a) => ({
            slug: a.slug,
            name: a.name,
            responsibilities: a.responsibilities,
            is_leaf: options.agentStore.isLeafAgent(a.id),
            parent_slug: a.parentId
              ? options.agentStore
                  .listAllAgents()
                  .find((p) => p.id === a.parentId)?.slug
              : null,
          })),
        }),
      },
    ]);

    const parsed = JSON.parse(response.content) as {
      assignments?: Array<{ title?: string; agent_slug?: string; reason?: string }>;
    };

    for (const assignment of parsed.assignments ?? []) {
      if (!assignment.title) continue;
      const workItem = remaining.find((i) => i.title === assignment.title) ?? {
        title: assignment.title,
        priority: 0,
      };
      const stubResult = matchAgentStub({ ...options, workItem });
      const llmAgent = assignment.agent_slug
        ? options.agentStore.getAgentBySlugOrId(assignment.agent_slug)
        : undefined;

      let agent = llmAgent ?? stubResult.agent;
      let reason = assignment.reason ?? stubResult.reason;

      if (
        llmAgent?.slug === "kampaku" &&
        stubResult.agent.slug !== "kampaku"
      ) {
        agent = stubResult.agent;
        reason = stubResult.reason;
      }

      results.set(assignment.title, { agent, reason });
    }
  } catch {
    // fall through
  }

  for (const item of remaining) {
    if (!results.has(item.title)) {
      results.set(item.title, matchAgentStub({ ...options, workItem: item }));
    }
  }

  return results;
}

export async function matchAgent(options: MatchAgentOptions): Promise<MatchAgentResult> {
  const batch = await matchAgentsBatch([options.workItem], options);
  return batch.get(options.workItem.title) ?? matchAgentStub(options);
}

export function inferProjectLeadSlug(
  agentStore: AgentStore,
  intent: string,
  projectSlug?: string,
): string | undefined {
  const haystack = `${intent} ${projectSlug ?? ""}`.toLowerCase();
  const jefes = agentStore
    .listAllAgents()
    .filter((a) => a.slug.startsWith("jefe-") && a.source === "generated");

  for (const jefe of jefes) {
    const tokens = jefe.slug.replace(/^jefe-/, "").split("-");
    if (tokens.some((t) => t.length > 3 && haystack.includes(t))) {
      return jefe.slug;
    }
  }

  if (haystack.includes("web") || haystack.includes("interfaz")) {
    const webLead = jefes.find((a) => a.slug.includes("web") || a.slug.includes("interfaz"));
    if (webLead) return webLead.slug;
  }

  return undefined;
}
