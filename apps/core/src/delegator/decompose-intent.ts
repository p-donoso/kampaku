import type { AppConfig } from "../config.js";
import type { AgentRecord } from "../agents/types.js";
import type { ModelBroker } from "../model-broker/client.js";
import { expandUntilBudget } from "./expand-phase-leaves.js";
import {
  granularityPromptBlock,
  type PlanGranularity,
} from "./plan-granularity.js";
import {
  decomposeIntentStub,
  plannedProjectSchema,
  slugifyName,
  normalizePlannedWorkItems,
  type PlannedProject,
} from "./types.js";
import type { OpenWorkItemSummary } from "./open-work-items.js";
import { intentAllowsEngineeringDefaultAc } from "./domain-intent.js";

function buildDecomposeSystemPrompt(granularity: PlanGranularity, intent: string): string {
  const engineeringDefaults = intentAllowsEngineeringDefaultAc(intent);
  const acRule = engineeringDefaults
    ? "- acceptance_criteria must include at least one verifiable command (npm test, npm run build, file exists at path) or explicit file-exists check."
    : "- acceptance_criteria must be verifiable in the emperor's domain vocabulary (named deliverable exists, stated check passes). Do not invent npm test, OpenAPI, or CI unless the intent requires an engineering stack.";
  const assigneeRule =
    "- Suggest assignee_slug only from agents that already exist or roles the emperor named. Never invent a default frontend/backend/qa roster when the emperor did not ask for engineering roles.";
  const microConcern = engineeringDefaults
    ? "- One concern per leaf: one component, one endpoint, one test file, or one config file — not full features."
    : "- One concern per leaf: one deliverable or one domain check — not an entire project phase.";

  return `You are a project planning assistant for Kampaku.
All roadmaps and work items you produce are EXECUTION PLANS FOR AI AGENTS — not human task lists.
Agents (not humans) will perform the work. A project-lead agent maintains coherence across heavy delegation.
Stay domain-agnostic: use the emperor's stated domain vocabulary. Do not force a software team or stack onto non-engineering work, and do not invent a special writing recipe either — cover the aspects the emperor named.

Produce JSON with this structure:
{
  "project": { "name": string, "slug": string, "description": string },
  "project_lead_slug": string (agent slug who owns coherence — usually {project}-lead),
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
3. Depth is unlimited — nest as needed (phase → module → task → slice). Keep decomposing until every leaf meets the complexity budget.
4. Every milestone must have executed_by:"ai_agents" and concrete success_criteria.
5. The project_lead_slug agent is accountable for cross-agent coherence.
6. Use available_agents slugs when suggesting assignee_slug or project_lead_slug.
7. When existing_open_work_items is non-empty, plan incrementally:
   - Prefer refining an open task's scope or adding subtasks under it (parent_ref = exact existing parent title) over creating duplicate root tasks.
   - Only add new root tasks when the work does not fit any open parent, or the emperor explicitly asked for a new track.
   - Mention in each new/refined task description how it relates to existing open work (extend, unblock, or split).
   - Do not recreate tasks that already cover the same scope unless replacement is explicit in the intent.

Recursive decomposition (mandatory):
- Start with phase/module containers, then keep splitting any node that misses the complexity budget until every leaf is a micro-task.
- A node is too coarse if it is a root phase with too few descendant leaves, or a leaf that implies more than 3 files, more than 2 npm scripts, a thin description, or missing verifiable AC.
- Do not stop after two levels. Nest as deep as needed.
- Prefer emitting the full tree yourself. The platform will recursively expand remaining coarse nodes.

${granularityPromptBlock(granularity)}

Micro-task rules (mandatory for leaf tasks):
${microConcern}
- description min 200 characters: include context, target artifacts, links to requirements, and verifiable checks.
${acRule}
${engineeringDefaults ? "- Do not pack more than 3 file creations or more than 2 npm scripts into one leaf task." : "- Do not invent frontend/backend/qa roles or npm/CI acceptance when the emperor did not request an engineering stack."}
${assigneeRule}
- NEVER assign kampaku-* platform agents (kampaku-manager subtree) to external projects — only the project's own team under {slug}-lead.

Respond with valid JSON only.`;
}

export interface DecomposeIntentOptions {
  intent: string;
  projectSlug?: string;
  existingProjectName?: string;
  openWorkItems?: OpenWorkItemSummary[];
  agents: AgentRecord[];
  config: AppConfig;
  broker?: ModelBroker;
  granularity?: PlanGranularity;
}

export async function decomposeIntent(options: DecomposeIntentOptions): Promise<{
  plan: PlannedProject;
  plannerUsed: "llm" | "stub";
}> {
  const granularity = options.granularity ?? "fine";
  const incremental = Boolean(options.existingProjectName);
  const mode = incremental ? "incremental" : "greenfield";

  if (options.config.agentMode === "stub" || !options.broker) {
    const stub = decomposeIntentStub(options.intent, options.projectSlug);
    const expanded = await expandUntilBudget({
      plan: stub,
      intent: options.intent,
      granularity,
      broker: undefined,
      mode,
    });
    expanded.work_items = normalizePlannedWorkItems(expanded.work_items, options.intent);
    return { plan: expanded, plannerUsed: "stub" };
  }

  const available = await options.broker.isAvailable();
  if (!available) {
    const stub = decomposeIntentStub(options.intent, options.projectSlug);
    const expanded = await expandUntilBudget({
      plan: stub,
      intent: options.intent,
      granularity,
      mode,
    });
    expanded.work_items = normalizePlannedWorkItems(expanded.work_items, options.intent);
    return { plan: expanded, plannerUsed: "stub" };
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
      { role: "system", content: buildDecomposeSystemPrompt(granularity, options.intent) },
      {
        role: "user",
        content: JSON.stringify({
          intent: options.intent,
          project_slug: options.projectSlug,
          existing_project: options.existingProjectName,
          existing_open_work_items: options.openWorkItems ?? [],
          available_agents: agentSummary,
          granularity,
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

    const expanded = await expandUntilBudget({
      plan: parsed,
      intent: options.intent,
      granularity,
      broker: options.broker,
      mode,
    });
    expanded.work_items = normalizePlannedWorkItems(expanded.work_items, options.intent);

    return { plan: expanded, plannerUsed: "llm" };
  } catch {
    const stub = decomposeIntentStub(options.intent, options.projectSlug);
    const expanded = await expandUntilBudget({
      plan: stub,
      intent: options.intent,
      granularity,
      mode,
    });
    expanded.work_items = normalizePlannedWorkItems(expanded.work_items, options.intent);
    return { plan: expanded, plannerUsed: "stub" };
  }
}
