import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import { createModelBroker } from "../model-broker/client.js";
import { planGoal } from "./plan.js";
import type { ProjectJobContext } from "../application/pm/project-repository.js";
import { constrainPlanToProject } from "../application/pm/project-repository.js";
import { inferRequiresDeliverables } from "../application/pm/deliverable-requirements.js";
import { inferRequiredChecksFromObjective } from "../application/pm/work-item-checks.js";
import { normalizeObjectiveRequirements } from "../application/pm/project-objective-audit.js";
import { identifyAcceptanceCriteria } from "../application/pm/acceptance-criteria.js";
import { parseCriterionChecks } from "../application/pm/criterion-checks.js";
import type { Store } from "../persistence/store.js";
import type { RepositoryRole } from "../config.js";
import { getFilesystemSettings, toFilesystemPolicy } from "../application/settings/filesystem.js";
import { deriveFrozenPaths } from "../delegator/plan-validation.js";
import { getGlobalSystemPromptSettings } from "../application/settings/global-system-prompt.js";
import { brokerOptionsFor, resolveModelProviderSettings } from "../application/settings/model-provider.js";
import type { PlannedTask } from "./stub.js";

export interface CreateGoalRequest {
  projectId: string;
  objective: string;
  priority?: number;
  repositoryRole?: RepositoryRole;
  projectContext?: ProjectJobContext;
  memoryContext?: string;
  plannedTask?: PlannedTask;
}

export async function createGoalWithPlan(
  store: Store,
  config: AppConfig,
  request: CreateGoalRequest,
) {
  const modelProvider = resolveModelProviderSettings(store, config);
  if (config.plannerMode === "llm" && !modelProvider.apiKey) throw new Error("An API key is required when KAMPAKU_PLANNER=llm");

  const planner =
    config.plannerMode === "llm"
      ? createModelBroker(brokerOptionsFor("planning", config, modelProvider))
      : undefined;

  const plan = request.plannedTask
    ? { task: request.plannedTask, plannerUsed: "work-item" as const }
    : await planGoal({
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
  store.recordObjectiveRequirements(request.projectId, request.objective, normalizeObjectiveRequirements(request.objective, taskPlan.acceptanceCriteria));

  const taskId = uuidv4();
  const filesystemPolicy = toFilesystemPolicy(getFilesystemSettings(store));
  const { apiKey: _apiKey, ...publicModelProvider } = modelProvider;
  const requiredChecks = inferRequiredChecksFromObjective(request.objective);
  const verificationCapabilities = [...new Set(parseCriterionChecks(identifyAcceptanceCriteria(taskPlan.acceptanceCriteria ?? []).map((item) => ({ id: item.id, text: item.text }))).map((check) => check.verifier))];

  const prompt = [request.memoryContext, taskPlan.prompt].filter(Boolean).join("\n\n");
  // What this job must not write.
  //
  // A work item's dispatch passes what it derived from the item's own text; this fallback covers the jobs that
  // have no work item behind them (a direct `kampaku run`, the planner's own runs) by reading the same prose the
  // worker will read. Both halves are needed because a freeze nobody hands to the write boundary is a sentence.
  const frozenPaths =
    (request.plannedTask?.frozenPaths?.length ?? 0) > 0
      ? request.plannedTask!.frozenPaths
      : deriveFrozenPaths({ title: taskPlan.title, description: request.objective });
  const jobInput = {
    globalSystemPrompt: getGlobalSystemPromptSettings(store).prompt,
    prompt,
    repositoryRole: taskPlan.repositoryRole,
    repositoryPath: request.projectContext?.repositoryPath,
    workspaceDir: request.projectContext?.workspaceDir,
    requiredChecks: requiredChecks.length > 0 ? requiredChecks : undefined,
    requiresDeliverables: inferRequiresDeliverables(request.objective),
    frozenPaths: frozenPaths.length > 0 ? frozenPaths : undefined,
    verificationCapabilities,
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
    routedVia: "routedVia" in plan ? plan.routedVia : undefined,
  };
}
