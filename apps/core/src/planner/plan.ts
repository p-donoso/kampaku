import type { RepositoryRole } from "../config.js";
import type { ChatMessage } from "../model-broker/types.js";
import { PLANNER_SYSTEM_PROMPT } from "./prompts.js";
import { plannerOutputSchema, planWithStub, type PlannedTask } from "./stub.js";

export interface PlanGoalOptions {
  objective: string;
  repositoryRole?: RepositoryRole;
  plannerMode: "llm" | "stub";
  planner?: PlannerClient;
  projectContext?: import("../application/pm/project-repository.js").ProjectJobContext;
}

export interface PlannerResult {
  content: string;
  model?: string;
  routedVia?: string;
}

export interface PlannerClient {
  chat(messages: ChatMessage[]): Promise<PlannerResult>;
}

export async function planGoal(options: PlanGoalOptions): Promise<{
  task: PlannedTask;
  plannerUsed: "llm" | "stub";
  routedVia?: string;
}> {
  if (options.plannerMode === "stub") {
    return {
      task: planWithStub(options.objective, options.repositoryRole ?? "core"),
      plannerUsed: "stub",
    };
  }

  if (!options.planner) {
    throw new Error("the model endpoint planner is not configured");
  }

  const result = await options.planner.chat([
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        objective: options.objective,
        preferredRepositoryRole: options.repositoryRole,
        project: options.projectContext
          ? {
              slug: options.projectContext.projectSlug,
              name: options.projectContext.projectName,
              repositories: options.projectContext.repositories,
              isExternal: options.projectContext.isExternal,
              repositoryPath: options.projectContext.repositoryPath,
              stackHints: options.projectContext.stackHints,
            }
          : undefined,
      }),
    },
  ]);

  const parsed = plannerOutputSchema.parse(JSON.parse(result.content));
  return {
    task: parsed.tasks[0]!,
    plannerUsed: "llm",
    routedVia: result.routedVia,
  };
}
