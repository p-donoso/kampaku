import type { GoalAudit } from "../application/goals.js";
import type { RepositoryRole } from "../config.js";
import type { CoreClient } from "../client/core-client.js";
import { printAudit } from "./output.js";

export interface SubmitGoalOptions {
  repo: RepositoryRole;
  projectId?: string;
}

export async function resolveProjectId(
  client: CoreClient,
  projectId?: string,
): Promise<string> {
  if (projectId) return projectId;

  const project = await client.getDefaultProject();
  if (!project?.id) {
    throw new Error("No project found. Run `kampaku bootstrap` first.");
  }

  return project.id;
}

export async function submitGoal(
  client: CoreClient,
  options: SubmitGoalOptions,
  objective: string,
): Promise<GoalAudit> {
  const projectId = await resolveProjectId(client, options.projectId);

  const goal = await client.createGoal({
    projectId,
    objective,
    repositoryRole: options.repo,
  });

  console.log(`Goal created: ${goal.id}`);

  return client.waitForGoal(goal.id);
}

export async function showLatestStatus(client: CoreClient, goalId?: string): Promise<void> {
  let resolvedGoalId = goalId;

  if (!resolvedGoalId) {
    const goals = await client.listGoals({ limit: 1 });
    resolvedGoalId = goals[0]?.id;
  }

  if (!resolvedGoalId) {
    console.log("No goals found.");
    return;
  }

  const audit = await client.getGoalAudit(resolvedGoalId);
  printAudit(audit);
}

export function auditFailed(audit: GoalAudit): boolean {
  return audit.results.some((result) => result.status !== "succeeded");
}
