import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config.js";
import { createModelBroker } from "../model-broker/client.js";
import { planGoal } from "./plan.js";
import type { ProjectJobContext } from "../application/pm/project-repository.js";
import { constrainPlanToProject } from "../application/pm/project-repository.js";
import { inferReadOnlyJob, inferRequiresDeliverables } from "../application/pm/deliverable-requirements.js";
import { inferPassingCheckScripts, inferRequiredChecksFromObjective } from "../application/pm/work-item-checks.js";
import { dispatchRequiredChecks, expectsFailingCheck } from "../application/pm/leaf-checks.js";
import { declarationsOf } from "../delegator/check-validation.js";
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
  /**
   * The caller knows this leaf owes no file, and why.
   *
   * Measured 2026-11-23 on suite 19 run `s19r20`: a phase-gate leaf on an external checkout was told *"Record the
   * audit in your completion report … Do not add files to this checkout"*, obeyed, and was failed
   * `WORKER_NO_DELIVERABLES` for it. The structure decided it — a phase gate on somebody else's repository — and the
   * structure is the caller's to read (`phaseGateOwesNoFiles`), so it is passed rather than re-derived from prose the
   * leaf's title contradicts.
   */
  observationOnly?: boolean;
  /**
   * The leaf's title and description **without its acceptance criteria**, when the caller holds them apart.
   *
   * Only `execute-work-item` does: it has the work item. Passing it keeps the obligation reading on what the leaf
   * *is* instead of on how its evidence is worded (`resolveJobWritingPolicy`).
   */
  leafProse?: string;
  /** The leaf's acceptance criteria, read only for a clean-tree requirement (`resolveJobWritingPolicy`). */
  leafCriteria?: string[];
}

/**
 * What a job may write and what it owes, decided once for the dispatch.
 *
 * Two flags, one reading: a job that must not write must not be failed for not writing, and a job that owes files
 * must be refused when it writes nothing. `observationOnly` is the caller's structural answer and wins, because a
 * caller that knows the item is a phase gate knows more than the leaf's prose does.
 */
export function resolveJobWritingPolicy(input: {
  /**
   * The leaf's **own prose** — its title and its description. Never its acceptance criteria.
   *
   * Measured 2026-11-23 on suite 19 run `s19r22`: the parse repair leaf's criterion `ac-3` reads *"A **read-only
   * probe** quoted in the completion report shows…"* — a sentence describing a *command*, not the leaf. The narrow
   * wording pattern matched `read-only`, so the repair was dispatched with `readOnly: true` and
   * `requiresDeliverables: false`, and its job reported *"job is read-only, change cannot be applied; the write tools
   * refuse this job"* and landed nothing. The leaf's own description says *"Single-file edit in src/ledger/parse.py
   * … Add comment handling"*, and the plan's `src/ledger/totals.py` sibling did the identical one-line repair in the
   * same phase, which is how the two were told apart at all.
   *
   * A criterion is an assertion about evidence, and its vocabulary is the vocabulary of commands — the same reason
   * `hasEvidenceOnlyWording` is documented as the *narrow* reading for criteria. Reading a leaf's obligation from the
   * wording of its evidence makes the evidence decide what the work is.
   */
  prose: string;
  /**
   * The leaf's acceptance criteria, read for **one** question only: does the leaf require the checkout to be left
   * exactly as it was found? A leaf whose own evidence demands an empty `git status` cannot also owe a file, and
   * that contradiction is not a matter of vocabulary (suite 19 `s19r25`, BOARD F-161).
   */
  criteria?: string[];
  observationOnly?: boolean;
}): { readOnly: boolean; requiresDeliverables: boolean } {
  if (input.observationOnly === true) return { readOnly: true, requiresDeliverables: false };
  return {
    readOnly: inferReadOnlyJob(input.prose, input.criteria),
    requiresDeliverables: inferRequiresDeliverables(input.prose, input.criteria),
  };
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
  // The required checks belong to the task, not only to the objective: a plan writes its acceptance criteria per
  // leaf, and a job dispatched for that leaf has to run the check those criteria name. Measured 2026-11-05 on
  // suite 19's first run, the job's own record read `requiredChecks: []` for a leaf whose criterion quoted
  // `./run-tests.sh`, so the executor had nothing to run and refused the attempt.
  // The read-only reading comes first, because it decides whether a green check can be asked for at all: a job that
  // may not write cannot turn a red check green (suite 19 `s19r13`).
  const writingPolicy = resolveJobWritingPolicy({
    // The leaf's own prose when the caller has it apart from its criteria; the objective otherwise (`kampaku run`,
    // where there is no work item to separate).
    prose: request.leafProse ?? request.objective,
    ...(request.leafCriteria ? { criteria: request.leafCriteria } : {}),
    ...(request.observationOnly === true ? { observationOnly: true } : {}),
  });
  const readOnly = writingPolicy.readOnly;
  const requiredChecks = dispatchRequiredChecks(
    {
      title: taskPlan.title,
      description: request.objective,
      acceptanceCriteria: taskPlan.acceptanceCriteria,
      readOnly,
    },
    request.projectContext?.repositoryPath,
  );
  // The router classifies a criterion's **wording**; the checkout decides what the executor **can** run.
  //
  // Measured 2026-11-05 taking suite 19 (`s19r1`), on a legacy Python checkout whose only check is
  // `./run-tests.sh`: the plan wrote a criterion quoting that command, the router read the quoted chain
  // (`cd <path> && ./run-tests.sh`) as prose rather than as a check, and the job's policy therefore carried no
  // `run_check` — so the executor's one attempt answered
  // `{"ok":false,"error":"Capability denied by work-item policy: run_check"}` and the factory could not
  // observe the failure it had been asked to diagnose. A work item whose project's checkout declares a check
  // may run it; what the run *proves* is still decided by the criteria and by closure.
  const declaredChecks = declarationsOf(request.projectContext?.repositoryPath);
  const routedCapabilities = parseCriterionChecks(
    identifyAcceptanceCriteria(taskPlan.acceptanceCriteria ?? []).map((item) => ({ id: item.id, text: item.text })),
  ).map((check) => check.verifier);
  const verificationCapabilities = [
    ...new Set([...routedCapabilities, ...(declaredChecks.length > 0 ? ["run_check"] : [])]),
  ];

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
    // **Always sent, even when empty.** An empty list is the decision that this leaf owes no green check — the
    // baseline leaf, the repair leaf whose sibling's check is still red — and leaving the field out made it
    // indistinguishable from a job with no policy at all, so the worker inferred one from the prompt and failed the
    // job on a defect the leaf does not own (suite 19 `s19r26`/`s19r27`, BOARD F-149's shape one layer down).
    requiredChecks,
    // The direction the check must come out in. A leaf that exists to record a failing runner must not be failed for
    // recording one (BOARD F-146, measured on `s19r18`): the reading is Core's, because Core holds the plan.
    expectsFailingCheck:
      expectsFailingCheck({
        title: taskPlan.title,
        description: request.objective,
        acceptanceCriteria: taskPlan.acceptanceCriteria,
      }) || undefined,
    requiresDeliverables: writingPolicy.requiresDeliverables,
    // The other half of the same reading: a job exempted from writing is refused when it writes. Measured
    // 2026-11-08 on suite 19 run `s19r6`, where the evidence-only audit job was let through the deliverables
    // gate and then succeeded by writing an unrequested report into the checkout (BOARD F-093).
    readOnly: readOnly || undefined,
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
