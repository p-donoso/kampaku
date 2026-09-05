import type { AppConfig } from "../config.js";
import type { AgentRecord } from "../agents/types.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { ModelBroker } from "../model-broker/client.js";
import {
  decomposeIntentStub,
  plannedProjectSchema,
  slugifyName,
  type PlannedProject,
} from "./types.js";
import type { OpenWorkItemSummary } from "./open-work-items.js";

const DECOMPOSE_SYSTEM_PROMPT = `You are a project planning assistant for Kampaku.
All roadmaps and work items you produce are EXECUTION PLANS FOR AI AGENTS — not human task lists.
Agents (not humans) will perform the work. A project-lead agent maintains coherence across heavy delegation.

Produce JSON with this structure:
{
  "project": { "name": string, "slug": string, "description": string },
  "project_lead_slug": string (agent slug who owns coherence — usually a jefe-* agent),
  "coherence_strategy": string (how the project lead tracks tasks and prevents drift),
  "documents": [{ "title": string, "content_md": string }],
  "milestones": [{
    "title": string,
    "description": string,
    "target_date": string (optional),
    "executed_by": "ai_agents",
    "success_criteria": [string] (measurable closure conditions for the milestone)
  }],
  "work_items": [{
    "title": string,
    "description": string,
    "priority": number (0=highest),
    "parent_ref": string (optional — parent task title for recursive tree),
    "suggested_responsibility": string,
    "assignee_slug": string (optional if known),
    "acceptance_criteria": [string] (per-task closure conditions),
    "depends_on": [string] (optional titles of tasks that must finish first)
  }]
}

Planning rules:
1. Use a recursive task tree: phases/modules as parent tasks, executable work as leaf tasks.
2. List parent tasks BEFORE their children in work_items array.
3. Depth is unlimited — nest as needed (phase → module → task → subtask).
4. Every milestone must have executed_by:"ai_agents" and concrete success_criteria.
5. The project_lead_slug agent is accountable for cross-agent coherence.
6. Use available_agents slugs when suggesting assignee_slug or project_lead_slug.
7. When existing_open_work_items is non-empty, plan incrementally:
   - Prefer refining an open task's scope or adding subtasks under it (parent_ref = exact existing parent title) over creating duplicate root tasks.
   - Only add new root tasks when the work does not fit any open parent, or the emperor explicitly asked for a new track.
   - Mention in each new/refined task description how it relates to existing open work (extend, unblock, or split).
   - Do not recreate tasks that already cover the same scope unless replacement is explicit in the intent.

Respond with valid JSON only.`;

export interface DecomposeIntentOptions {
  intent: string;
  projectSlug?: string;
  existingProjectName?: string;
  openWorkItems?: OpenWorkItemSummary[];
  agents: AgentRecord[];
  config: AppConfig;
  broker?: ModelBroker;
}

export async function decomposeIntent(options: DecomposeIntentOptions): Promise<{
  plan: PlannedProject;
  plannerUsed: "llm" | "stub";
}> {
  if (options.config.agentMode === "stub" || !options.broker) {
    return {
      plan: decomposeIntentStub(options.intent, options.projectSlug),
      plannerUsed: "stub",
    };
  }

  const available = await options.broker.isAvailable();
  if (!available) {
    return {
      plan: decomposeIntentStub(options.intent, options.projectSlug),
      plannerUsed: "stub",
    };
  }

  try {
    const agentSummary = options.agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      responsibilities: a.responsibilities,
      parent_slug: a.parentId
        ? options.agents.find((p) => p.id === a.parentId)?.slug
        : null,
    }));

    const result = await options.broker.chat([
      { role: "system", content: DECOMPOSE_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          intent: options.intent,
          project_slug: options.projectSlug,
          existing_project: options.existingProjectName,
          existing_open_work_items: options.openWorkItems ?? [],
          available_agents: agentSummary,
        }),
      },
    ]);

    const raw = JSON.parse(result.content) as unknown;
    const parsed = plannedProjectSchema.parse(raw);

    if (options.projectSlug && parsed.project) {
      parsed.project.slug = options.projectSlug;
    } else if (parsed.project && !parsed.project.slug) {
      parsed.project.slug = slugifyName(parsed.project.name);
    }

    for (const milestone of parsed.milestones ?? []) {
      milestone.executed_by ??= "ai_agents";
    }

    return { plan: parsed, plannerUsed: "llm" };
  } catch {
    return {
      plan: decomposeIntentStub(options.intent, options.projectSlug),
      plannerUsed: "stub",
    };
  }
}
