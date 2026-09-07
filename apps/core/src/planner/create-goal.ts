import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import { createModelBroker } from "../model-broker/client.js";
import { planGoal } from "./plan.js";
import type { ProjectJobContext } from "../application/pm/project-repository.js";
import { constrainPlanToProject } from "../application/pm/project-repository.js";
import { inferRequiresDeliverables } from "../application/pm/deliverable-requirements.js";
import { inferRequiredChecksFromObjective } from "../application/pm/work-item-checks.js";
import type { Store } from "../persistence/store.js";
import type { RepositoryRole } from "../config.js";
import { getFilesystemSettings, toFilesystemPolicy } from "../application/settings/filesystem.js";
import { getGlobalSystemPromptSettings } from "../application/settings/global-system-prompt.js";
import { resolveModelProviderSettings } from "../application/settings/model-provider.js";

export interface CreateGoalRequest {
  projectId: string;
  objective: string;
  priority?: number;
  repositoryRole?: RepositoryRole;
  projectContext?: ProjectJobContext;
  memoryContext?: string;
}

export async function createGoalWithPlan(
  store: Store,
  config: AppConfig,
  request: CreateGoalRequest,
) {
  const modelProvider = resolveModelProviderSettings(store, config);
  if (config.plannerMode === "llm" && !modelProvider.apiKey) throw new Error("An API key is required when KAMPAKU_PLANNER=llm");

  const goalId = uuidv4();
  const now = new Date().toISOString();

  store.createGoal({
    id: goalId,
    projectId: request.projectId,
    objective: request.objective,
    priority: request.priority ?? 0,
    status: "active",
    createdAt: now,
  });

  const planner =
    config.plannerMode === "llm"
      ? createModelBroker({ ...modelProvider, model: modelProvider.model || config.plannerModel })
      : undefined;

  const plan = await planGoal({
    objective: request.objective,
    repositoryRole: request.repositoryRole,
    plannerMode: config.plannerMode,
    planner,
    projectContext: request.projectContext,
  });

  const project = store.getProject(request.projectId);
  const taskPlan =
    project && request.projectContext
      ? constrainPlanToProject(plan.task, project, request.projectContext)
      : plan.task;

  const taskId = uuidv4();
  const filesystemPolicy = toFilesystemPolicy(getFilesystemSettings(store));
  const { apiKey: _apiKey, ...publicModelProvider } = modelProvider;
  const requiredChecks = inferRequiredChecksFromObjective(request.objective);

  const prompt = [request.memoryContext, taskPlan.prompt].filter(Boolean).join("\n\n");
  const jobInput = {
    globalSystemPrompt: getGlobalSystemPromptSettings(store).prompt,
    prompt,
    repositoryRole: taskPlan.repositoryRole,
    repositoryPath: request.projectContext?.repositoryPath,
    workspaceDir: request.projectContext?.workspaceDir,
    requiredChecks: requiredChecks.length > 0 ? requiredChecks : undefined,
    requiresDeliverables: inferRequiresDeliverables(request.objective),
    project: request.projectContext
      ? {
          id: request.projectContext.projectId,
          slug: request.projectContext.projectSlug,
          name: request.projectContext.projectName,
          workItemId: request.projectContext.workItemId,
        }
      : undefined,
    context: {
      goalId,
      taskId,
      workItemId: request.projectContext?.workItemId,
    },
    filesystemPolicy,
    modelProvider: publicModelProvider,
  };

  store.createTask({
    id: taskId,
    goalId,
    title: taskPlan.title,
    status: "ready",
    input: jobInput,
    acceptanceCriteria: taskPlan.acceptanceCriteria,
  });

  const jobId = uuidv4();
  store.createJob({
    id: jobId,
    taskId,
    status: "queued",
    capabilities: ["code.agent"],
    input: jobInput,
    idempotencyKey: jobId,
  });

  return {
    goal: store.getGoal(goalId)!,
    taskId,
    jobId,
    plannerUsed: plan.plannerUsed,
    routedVia: plan.routedVia,
  };
}
