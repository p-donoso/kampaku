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

/**
 * The planner is configured for a model and no key was resolved, so nothing can be planned.
 *
 * A typed error rather than a plain `Error`, because the sentence is the whole point of it: measured 2026-11-04
 * while opening suite 16, `POST /api/v1/work-items/:id/execute` on a Core whose `KAMPAKU_PLANNER` was `llm` with
 * no key answered a bare **500 Internal Server Error** with no body, while the product had the answer in hand.
 * Suite 16's oracle is explicit — *"error states show the server's own explanation, not a bare status code"* — and
 * a released leaf that answers "Internal Server Error" sends the operator to look at the worker, the queue and the
 * endpoint, none of which is the problem (BOARD F-134).
 */
export class PlanningConfigurationError extends Error {
  readonly code = "PLANNER_NOT_CONFIGURED" as const;

  constructor(message: string) {
    super(message);
    this.name = "PlanningConfigurationError";
  }
}

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
  if (config.plannerMode === "llm" && !modelProvider.apiKey) {
    throw new PlanningConfigurationError(
      "An API key is required when KAMPAKU_PLANNER=llm. Nothing was released and no goal was created: set the " +
        "model provider's key (Settings → Models, or `KAMPAKU_MODEL_API_KEY`), or run with KAMPAKU_PLANNER=stub for " +
        "an offline instance.",
    );
  }

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
