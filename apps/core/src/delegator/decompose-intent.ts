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
  parsePlannedProject,
  slugifyName,
  normalizePlannedWorkItems,
  type PlannedProject,
} from "./types.js";
import type { OpenWorkItemSummary } from "./open-work-items.js";
import {
  assertTurnBudget,
  TurnBudgetExceededError,
  type TurnDeadline,
} from "../agents/runtime/turn-budget.js";

function buildDecomposeSystemPrompt(granularity: PlanGranularity): string {
  return `You are a project planning assistant for Kampaku.
All roadmaps and work items you produce are EXECUTION PLANS FOR AI AGENTS — not human task lists.
Agents (not humans) will perform the work. A project-lead agent maintains coherence across heavy delegation.

Produce JSON with this structure:
{
  "vertical_slices": [{ "id": string, "title": string, "outcome": string, "requirement_ids": [string], "work_item_ids": [string], "evidence_kinds": [string] }],
  "project": { "name": string, "slug": string, "description": string },
  "project_lead_slug": string (agent slug who owns coherence — e.g. {slug}-lead),
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
    "frozen_paths": [string] (optional — paths this task must NOT write; enforced at the worker's write boundary),
    "depends_on": [string] (optional titles of tasks that must finish first)
  }]
}

Planning rules:
1. Use a recursive task tree: phases/modules as parent tasks, executable work as leaf tasks.
1a. Organize implementation around vertical_slices. Each slice must state an observable user or stakeholder outcome and map requirements, work items, and evidence; do not assume a software project.
1b. Any examples in this prompt are illustrative, not an exhaustive taxonomy. Preserve novel project types instead of forcing them into a known category.
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
- A node is too coarse if it is a root phase with too few descendant leaves, or a leaf that implies more than 3 files, more than 2 check commands, a thin description, or missing verifiable AC.
- Do not stop after two levels. Nest as deep as needed.
- Prefer emitting the full tree yourself. The platform will recursively expand remaining coarse nodes.

${granularityPromptBlock(granularity)}

Micro-task rules (mandatory for leaf tasks):
- One concern per leaf: one component, one endpoint, one test file, or one config file — not full features.
- description min 200 characters: include context, target file paths, links to wireframes/requirements, and verifiable commands.
- acceptance_criteria must include observable evidence appropriate to the deliverable: a check or command the project declares, an artifact path, a documented endpoint or interface behavior, or an explicit publication/export/persistence result. Every deliverable is software or a technical artifact that ships with it; a request whose evidence would be editorial judgment is refused at intake, not planned.
- Do not pack more than 3 file creations or more than 2 check commands into one leaf task.
- For new projects, suggest an assignee_slug from the roles the project actually needs, derived from the aspects present in its repository. Do not default to a web-app roster (lead, frontend, backend, qa, auditor); propose a role only when the work requires that responsibility.
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
  /** The clock of the turn that asked for this plan, so planning cannot outlive the turn. */
  turn?: TurnDeadline | undefined;
}

export async function decomposeIntent(options: DecomposeIntentOptions): Promise<{
  plan: PlannedProject;
  plannerUsed: "llm" | "stub";
}> {
  const granularity = options.granularity ?? "fine";
  const incremental = Boolean(options.existingProjectName);
  const mode = incremental ? "incremental" : "greenfield";

  if (options.config.plannerMode === "stub") {
    const stub = decomposeIntentStub(options.intent, options.projectSlug);
    const expanded = await expandUntilBudget({
      plan: stub,
      intent: options.intent,
      granularity,
      broker: undefined,
      mode,
      turn: options.turn,
    });
    expanded.work_items = normalizePlannedWorkItems(expanded.work_items);
    return { plan: expanded, plannerUsed: "stub" };
  }

  if (!options.broker) {
    throw new Error("LLM planning requires a configured model broker.");
  }

  // The decomposition itself is a model call, and it is the first one a plan costs. It is checked here for
  // the same reason the expansion is: it belongs to the turn, not to the tool call. See turn-budget.ts.
  assertTurnBudget(options.turn, "Project planning");
  const available = await options.broker.isAvailable();
  if (!available) {
    throw new Error("LLM planning is required, but the configured model provider is unavailable.");
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
      { role: "system", content: buildDecomposeSystemPrompt(granularity) },
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
    // Through `parsePlannedProject`, not `plannedProjectSchema.parse`: a model that writes `"parent_ref":
    // null` for a parentless node is saying what it means, and the bare parse threw the whole plan away for
    // it. See `nullsMeanAbsent`.
    const parsed = parsePlannedProject(raw);

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
      maxDepth: granularity === "standard" ? 0 : undefined,
      turn: options.turn,
    });

    return { plan: expanded, plannerUsed: "llm" };
  } catch (error) {
    // A budget stop is reported as itself. "LLM planning failed" would send the operator to the endpoint.
    if (error instanceof TurnBudgetExceededError) throw error;
    const reason = error instanceof Error ? `${error.name}: ${error.message.slice(0, 180)}` : "Unknown model error";
    throw new Error(`LLM planning failed; no generic fallback plan was created. ${reason}`, { cause: error });
  }
}
