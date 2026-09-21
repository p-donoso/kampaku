import type { AppConfig, RepositoryRole } from "../../config.js";
import { createGoalWithPlan } from "../../planner/create-goal.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { SkillStore } from "../../persistence/skill-store.js";
import type { Store, JobResultRecord } from "../../persistence/store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import { recordCompletionReportJournal, recordCompletionAgentMemory, type CompletionRecipientContext } from "./journal-events.js";
import { buildPostActionRuntime, recordPostActionLifecycle } from "./post-action/index.js";
import {
  evaluateJobCheckResults,
  inferRequiredChecksFromWorkItem,
} from "./work-item-checks.js";
import { runPhaseCompletionHooks } from "./phase-completion-hook.js";
import { ensurePhaseAuditorAfterLeafDone } from "./phase-auditor-gate.js";
import { formatAcceptanceCriteriaForWorker } from "./acceptance-criteria.js";
import { shouldBlockDishonestSuccess } from "./done-honesty.js";
import { ensureLeafSplitWorkItem, isOverweightLeaf } from "./leaf-splitter.js";
import { recallLearningsForJob } from "./job-memory.js";
import {
  resolveProjectJobContext,
  type ProjectJobContext,
} from "./project-repository.js";
import {
  canExecuteLeaf,
  collectLeavesInOrder,
} from "./work-item-order.js";
import { rollupParentWorkItemStatuses } from "./work-item-parent-rollup.js";

export class ExecuteWorkItemError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT",
  ) {
    super(message);
    this.name = "ExecuteWorkItemError";
  }
}

export interface ExecuteWorkItemContext {
  store: Store;
  pmStore: PmStore;
  agentStore: AgentStore;
  skillStore: SkillStore;
  config: AppConfig;
  memoryStore?: MemoryStore;
}

export interface ExecuteWorkItemResult {
  workItemId: string;
  goalId?: string;
  jobId?: string;
  objective: string;
  repositoryRole?: RepositoryRole;
}

function buildObjective(title: string, description?: string, acceptanceCriteria: string[] = []): string {
  const parts = [title];
  if (description?.trim()) parts.push(description.trim());
  if (acceptanceCriteria.length > 0) {
    parts.push("Acceptance criteria:");
    for (const criterion of formatAcceptanceCriteriaForWorker(acceptanceCriteria)) parts.push(`- ${criterion}`);
  }
  return parts.join("\n\n");
}

function resolveRepositoryRole(
  projectSlug: string,
  repositories: Array<{ url: string; role?: string }>,
): RepositoryRole {
  return resolveProjectJobContext({
    id: "",
    slug: projectSlug,
    name: projectSlug,
    status: "active",
    repositories,
    createdAt: "",
    updatedAt: "",
  }).repositoryRole;
}

export { resolveProjectJobContext, type ProjectJobContext };

export async function executeWorkItem(
  ctx: ExecuteWorkItemContext,
  workItemId: string,
): Promise<ExecuteWorkItemResult> {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) {
    throw new ExecuteWorkItemError("Work item not found.", "NOT_FOUND");
  }

  const children = ctx.pmStore
    .listWorkItemsByProject(workItem.projectId)
    .filter((item) => item.parentId === workItem.id);
  if (children.length > 0) {
    throw new ExecuteWorkItemError("Container tasks cannot be executed directly.", "VALIDATION");
  }

  if (isOverweightLeaf(workItem)) {
    ensureLeafSplitWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, workItem);
    const slices = ctx.pmStore
      .listWorkItemsByProject(workItem.projectId)
      .filter((item) => item.parentId === workItem.id && item.status === "todo")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (slices[0]) {
      return executeWorkItem(ctx, slices[0].id);
    }
  }

  if (workItem.status === "in_progress" && workItem.goalId) {
    throw new ExecuteWorkItemError("Work item is already executing.", "CONFLICT");
  }

  if (workItem.status === "done") {
    throw new ExecuteWorkItemError("Work item is already done.", "CONFLICT");
  }

  const projectItems = ctx.pmStore.listWorkItemsByProject(workItem.projectId);
  const tree = ctx.pmStore.buildWorkItemTree(projectItems);
  const orderedLeaves = collectLeavesInOrder(tree);
  const eligibility = canExecuteLeaf(workItem, orderedLeaves, projectItems, ctx.pmStore);
  if (!eligibility.ok) {
    throw new ExecuteWorkItemError(eligibility.reason, "VALIDATION");
  }

  const project = ctx.store.getProject(workItem.projectId);
  if (!project) {
    throw new ExecuteWorkItemError("Project not found.", "NOT_FOUND");
  }

  const projectContext = resolveProjectJobContext(project, workItemId);
  const objective = buildObjective(
    workItem.title,
    workItem.description,
    workItem.acceptanceCriteria,
  );

  if (workItem.assigneeAgentId) {
    const caps = ctx.skillStore.getAgentCapabilities(workItem.assigneeAgentId);
    if (caps.length > 0 && !caps.includes("code.agent") && !caps.includes("cursor.agent")) {
      throw new ExecuteWorkItemError(
        "Assignee agent lacks code.agent capability from assigned skills.",
        "VALIDATION",
      );
    }
  }

  const { goal, jobId } = await createGoalWithPlan(ctx.store, ctx.config, {
    projectId: project.id,
    objective,
    priority: workItem.priority,
    repositoryRole: projectContext.repositoryRole,
    projectContext,
    memoryContext: recallLearningsForJob(ctx.memoryStore, workItem),
    plannedTask: {
      title: workItem.title,
      prompt: objective,
      repositoryRole: projectContext.repositoryRole,
      acceptanceCriteria: workItem.acceptanceCriteria,
    },
  });

  ctx.pmStore.updateWorkItem(workItemId, {
    status: "in_progress",
    goalId: goal.id,
    jobId,
  });

  return {
    workItemId,
    goalId: goal.id,
    jobId,
    objective,
    repositoryRole: projectContext.repositoryRole,
  };
}

export async function retryWorkItem(
  ctx: ExecuteWorkItemContext,
  workItemId: string,
): Promise<ExecuteWorkItemResult> {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) {
    throw new ExecuteWorkItemError("Work item not found.", "NOT_FOUND");
  }

  const children = ctx.pmStore
    .listWorkItemsByProject(workItem.projectId)
    .filter((item) => item.parentId === workItem.id);
  if (children.length > 0) {
    throw new ExecuteWorkItemError("Container tasks cannot be retried directly.", "VALIDATION");
  }

  if (workItem.status !== "blocked") {
    throw new ExecuteWorkItemError("Only blocked tasks can be retried.", "VALIDATION");
  }

  ctx.pmStore.updateWorkItem(workItemId, {
    status: "todo",
    goalId: undefined,
    jobId: undefined,
  });

  return executeWorkItem(ctx, workItemId);
}

/**
 * Records the post-action review for an execution outcome.
 *
 * Automated reviews use the deterministic projection path so a provider outage
 * can never block closure bookkeeping. Failures surface as projection statuses.
 */
function recordWorkPostAction(
  stores: {
    pmStore: PmStore;
    agentStore?: AgentStore;
    journalStore?: JournalStore;
    memoryStore?: MemoryStore;
    store?: Store;
    wikiStore?: CompletionRecipientContext["wikiStore"];
    reviewStore?: CompletionRecipientContext["postActionStore"];
  },
  workItem: WorkItemRecord,
  jobId: string,
  result: JobResultRecord | undefined,
  event: "work_completed" | "work_failed",
  agentId?: string,
): void {
  if (!stores.agentStore || !stores.reviewStore) return;
  const output = result?.output && typeof result.output === "object"
    ? (result.output as Record<string, unknown>)
    : {};
  const fileList = Array.isArray(output.filesChanged)
    ? output.filesChanged.filter((entry): entry is string => typeof entry === "string")
    : [];
  const checkResults = output.checkResults && typeof output.checkResults === "object"
    ? Object.entries(output.checkResults as Record<string, unknown>)
    : [];
  const failureMessage = result?.error && typeof result.error === "object"
    ? String((result.error as Record<string, unknown>).message ?? "")
    : typeof result?.error === "string"
      ? result.error
      : "";

  recordPostActionLifecycle(
    buildPostActionRuntime({
      pmStore: stores.pmStore,
      agentStore: stores.agentStore,
      reviewStore: stores.reviewStore,
      store: stores.store,
      journalStore: stores.journalStore,
      memoryStore: stores.memoryStore,
      wikiStore: stores.wikiStore,
    }),
    {
      event,
      projectId: workItem.projectId,
      agentId,
      workItemId: workItem.id,
      referenceId: jobId,
      summary: [
        `${event === "work_completed" ? "Completed" : "Failed"} "${workItem.title}" (job ${jobId}).`,
        typeof output.summary === "string" ? output.summary : "",
        failureMessage ? `Error: ${failureMessage}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      files: fileList,
      checks: checkResults.map(([script, ok]) => `${script}: ${ok === true ? "pass" : "fail"}`),
      acceptanceCriteria: workItem.acceptanceCriteria,
      wikiSyncRequired: stores.store?.getProject(workItem.projectId)?.wikiSyncRequired === true,
    },
  );
}

export function syncWorkItemFromJobResult(
  pmStore: PmStore,
  jobId: string,
  jobStatus: string,
  journalStore?: JournalStore,
  result?: JobResultRecord,
  memoryStore?: MemoryStore,
  completionCtx?: CompletionRecipientContext,
): void {
  const workItem = pmStore.getWorkItemByJobId(jobId);
  if (!workItem) return;

  if (jobStatus === "succeeded") {
    const requiredChecks = inferRequiredChecksFromWorkItem(workItem);
    const checkResults =
      result?.output && typeof result.output === "object"
        ? (result.output as Record<string, unknown>).checkResults
        : undefined;
    const checkEval = evaluateJobCheckResults(
      requiredChecks,
      checkResults as Record<string, unknown> | undefined,
    );

    if (journalStore && result) {
      recordCompletionReportJournal(journalStore, pmStore, workItem, jobId, result, completionCtx);
    }
    if (memoryStore && result) {
      recordCompletionAgentMemory(memoryStore, workItem, result);
    }
    recordWorkPostAction(
      {
        pmStore,
        agentStore: completionCtx?.agentStore,
        journalStore,
        memoryStore,
        store: completionCtx?.store,
        wikiStore: completionCtx?.wikiStore,
        reviewStore: completionCtx?.postActionStore,
      },
      workItem,
      jobId,
      result,
      "work_completed",
      workItem.assigneeAgentId,
    );

    const assigneeMemory = workItem.assigneeAgentId && memoryStore
      ? memoryStore.list({ agentId: workItem.assigneeAgentId, kind: "log", projectId: workItem.projectId, limit: 100 })
        .some((memory) => memory.workItemId === workItem.id)
      : false;
    const honesty = shouldBlockDishonestSuccess(
      workItem,
      result,
      journalStore?.listForWorkItem(workItem.id) ?? [],
      {
        completionReport: (journalStore?.listForWorkItem(workItem.id) ?? []).some((entry) => entry.kind === "completion_report"),
        privateMemory: assigneeMemory,
        wikiSync: completionCtx?.store?.getProject(workItem.projectId)?.wikiSyncRequired === true
          ? (() => {
              const project = completionCtx.store?.getProject(workItem.projectId);
              const legacyPhaseKey = workItem.title.match(/phase[\s-]*(\d+)/i)?.[1];
              const phaseKey = workItem.phaseKey ?? (legacyPhaseKey ? `phase-${legacyPhaseKey}` : undefined);
              const requiredPage = (phaseKey && project?.wikiSyncPhasePages?.[phaseKey]) || project?.wikiSyncPageSlug;
              return (completionCtx.wikiStore?.listPagesByProject(workItem.projectId) ?? []).some((page) => page.status === "published" && page.updatedAt >= workItem.updatedAt && (!requiredPage || page.slug === requiredPage));
            })()
          : undefined,
      },
      { journalStore },
    );

    if (honesty.block || !checkEval.ok) {
      pmStore.updateWorkItem(workItem.id, { status: "blocked" });
      return;
    }

    pmStore.updateWorkItem(workItem.id, { status: "done" });
    ensurePhaseAuditorAfterLeafDone(
      pmStore,
      completionCtx?.agentStore,
      completionCtx?.store,
      workItem.id,
      journalStore,
    );
    rollupParentWorkItemStatuses(pmStore, workItem.id);

    if (completionCtx?.store) {
      runPhaseCompletionHooks(
        pmStore,
        completionCtx.store,
        journalStore,
        completionCtx.wikiStore,
        completionCtx.agentStore,
        workItem.id,
        completionCtx.postActionStore,
        memoryStore,
      );
    }
    return;
  }

  if (jobStatus === "failed" || jobStatus === "expired" || jobStatus === "cancelled") {
    recordWorkPostAction(
      {
        pmStore,
        agentStore: completionCtx?.agentStore,
        journalStore,
        memoryStore,
        store: completionCtx?.store,
        wikiStore: completionCtx?.wikiStore,
        reviewStore: completionCtx?.postActionStore,
      },
      workItem,
      jobId,
      result,
      "work_failed",
      workItem.assigneeAgentId,
    );
    pmStore.updateWorkItem(workItem.id, { status: "blocked" });
  }
}
