import type { KampakuToolContext } from "./index.js";
import { submitIntent } from "../../../application/pm/submit-intent.js";
import {
  parsePlanGranularity,
  type PlanGranularity,
} from "../../../delegator/plan-granularity.js";

export interface SubmitIntentArgs {
  intent: string;
  project_slug?: string;
  create_missing_agents?: boolean;
  granularity?: PlanGranularity;
}

export interface SubmitIntentResult {
  projectSlug: string;
  projectId: string;
  plannerUsed: string;
  workItemsCreated: number;
  assignments: Array<{
    title: string;
    assigneeSlug: string;
    reason: string;
  }>;
  summary: string;
}

export async function executeSubmitIntent(
  ctx: KampakuToolContext,
  args: SubmitIntentArgs,
): Promise<SubmitIntentResult> {
  const result = await submitIntent(ctx, {
    intent: args.intent,
    projectSlug: args.project_slug,
    createMissingAgents: args.create_missing_agents,
    granularity: parsePlanGranularity(args.granularity),
  });

  return {
    projectSlug: result.projectSlug,
    projectId: result.projectId,
    plannerUsed: result.plannerUsed,
    workItemsCreated: result.workItemsCreated,
    assignments: result.assignments.map((a) => ({
      title: a.title,
      assigneeSlug: a.assigneeSlug,
      reason: a.reason,
    })),
    summary: result.summary,
  };
}

export const SUBMIT_INTENT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_intent",
    description:
      "Primary entry point for project planning and organic delegation. " +
      "Provide the emperor's full intent in natural language; the system will decompose it, " +
      "create project structure (docs, roadmap, recursive tasks), and assign work to agents automatically. " +
      "When project_slug points to an existing project, open tasks are passed to the planner — prefer extending them or adding subtasks over duplicating work. " +
      "Call get_project first to review open tasks and state in intent which items you extend or parent under.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "The emperor's full request in natural language.",
        },
        project_slug: {
          type: "string",
          description: "Optional existing or preferred project slug.",
        },
        create_missing_agents: {
          type: "boolean",
          description: "Whether to create missing specialized agents (default false).",
        },
        granularity: {
          type: "string",
          enum: ["standard", "fine"],
          description:
            "Planning leaf budget. fine (default for new projects): 15–25 leaves per phase. standard: 8–12. Use fine for greenfield products.",
        },
      },
      required: ["intent"],
    },
  },
};
