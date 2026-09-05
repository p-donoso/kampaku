import type { AppConfig, RepositoryRole } from "../../config.js";
import { createGoalWithPlan } from "../../scheduler/create-goal.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { PmStore } from "../../persistence/pm-store.js";
import type { SkillStore } from "../../persistence/skill-store.js";
import type { Store, JobResultRecord } from "../../persistence/store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import { recordCompletionReportJournal, recordCompletionAgentMemory } from "./journal-events.js";
import {
  resolveProjectJobContext,
  type ProjectJobContext,
} from "./project-repository.js";
import {
  canExecuteLeaf,
  collectLeavesInOrder,
} from "./work-item-order.js";

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
}

export interface ExecuteWorkItemResult {
  workItemId: string;
  goalId: string;
  jobId: string;
  objective: string;
  repositoryRole: RepositoryRole;
}

function buildObjective(title: string, description?: string, acceptanceCriteria: string[] = []): string {
  const parts = [title];
  if (description?.trim()) parts.push(description.trim());
  if (acceptanceCriteria.length > 0) {
    parts.push("Acceptance criteria:");
    for (const criterion of acceptanceCriteria) parts.push(`- ${criterion}`);
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

export function syncWorkItemFromJobResult(
  pmStore: PmStore,
  jobId: string,
  jobStatus: string,
  journalStore?: JournalStore,
  result?: JobResultRecord,
  memoryStore?: MemoryStore,
): void {
  const workItem = pmStore.getWorkItemByJobId(jobId);
  if (!workItem) return;

  if (jobStatus === "succeeded") {
    if (journalStore && result) {
      recordCompletionReportJournal(journalStore, pmStore, workItem, jobId, result);
    }
    if (memoryStore && result) {
      recordCompletionAgentMemory(memoryStore, workItem, result);
    }
    pmStore.updateWorkItem(workItem.id, { status: "done" });
    return;
  }

  if (jobStatus === "failed" || jobStatus === "expired" || jobStatus === "cancelled") {
    pmStore.updateWorkItem(workItem.id, { status: "blocked" });
  }
}
