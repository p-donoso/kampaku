import type { AppConfig } from "../../config.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { SkillStore } from "../../persistence/skill-store.js";
import type { Store } from "../../persistence/store.js";
import {
  executeWorkItem,
  retryWorkItem,
  type ExecuteWorkItemContext,
  type ExecuteWorkItemResult,
} from "./execute-work-item.js";
import {
  findHeadBlockingWorkItem,
  getProjectExecutionGate,
  type ProjectExecutionGate,
} from "./project-execution-gate.js";
import {
  findNextExecutableWorkItem,
  projectAutoExecuteKey,
} from "./work-item-order.js";

export class ExecuteProjectError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT",
  ) {
    super(message);
    this.name = "ExecuteProjectError";
  }
}

export interface ExecuteProjectContext {
  store: Store;
  pmStore: PmStore;
  agentStore: AgentStore;
  skillStore: SkillStore;
  config: AppConfig;
  questionStore?: QuestionStore;
  blockageStore?: BlockageStore;
}

export function isProjectAutoExecuting(store: Store, projectId: string): boolean {
  return store.getBootstrapState<boolean>(projectAutoExecuteKey(projectId)) === true;
}

export function setProjectAutoExecuting(store: Store, projectId: string, enabled: boolean): void {
  store.setBootstrapState(projectAutoExecuteKey(projectId), enabled);
}

function resolveProject(store: Store, idOrSlug: string) {
  const project = store.getProjectByIdOrSlug(idOrSlug);
  if (!project) {
    throw new ExecuteProjectError("Project not found.", "NOT_FOUND");
  }
  return project;
}

export function getProjectExecutionState(
  ctx: Pick<ExecuteProjectContext, "store" | "pmStore" | "questionStore" | "blockageStore">,
  projectId: string,
): { autoExecute: boolean; gate: ProjectExecutionGate } {
  return {
    autoExecute: isProjectAutoExecuting(ctx.store, projectId),
    gate: getProjectExecutionGate(ctx.pmStore, projectId, ctx.questionStore, ctx.blockageStore),
  };
}

export async function playProject(
  ctx: ExecuteProjectContext,
  idOrSlug: string,
): Promise<{
  autoExecute: true;
  gated?: boolean;
  gate?: ProjectExecutionGate;
  started?: ExecuteWorkItemResult;
  nextWorkItemId?: string | null;
}> {
  const project = resolveProject(ctx.store, idOrSlug);
  setProjectAutoExecuting(ctx.store, project.id, true);

  const gate = getProjectExecutionGate(
    ctx.pmStore,
    project.id,
    ctx.questionStore,
    ctx.blockageStore,
  );
  if (gate.gated) {
    if (gate.reason === "blocked_task") {
      const blockingTask = findHeadBlockingWorkItem(ctx.pmStore, project.id);
      if (blockingTask) {
        const started = await retryWorkItem(ctx as ExecuteWorkItemContext, blockingTask.id);
        return { autoExecute: true, started, nextWorkItemId: blockingTask.id };
      }
    }
    return { autoExecute: true, gated: true, gate, nextWorkItemId: null };
  }

  const next = findNextExecutableWorkItem(ctx.pmStore, project.id);
  if (!next) {
    return { autoExecute: true, nextWorkItemId: null };
  }

  const started = await executeWorkItem(ctx as ExecuteWorkItemContext, next.id);
  return { autoExecute: true, started, nextWorkItemId: next.id };
}

export function pauseProject(
  store: Store,
  idOrSlug: string,
): { autoExecute: false } {
  const project = resolveProject(store, idOrSlug);
  setProjectAutoExecuting(store, project.id, false);
  return { autoExecute: false };
}

export async function advanceProjectIfAutoExecuting(
  ctx: ExecuteProjectContext,
  projectId: string,
): Promise<ExecuteWorkItemResult | null> {
  if (!isProjectAutoExecuting(ctx.store, projectId)) return null;

  const gate = getProjectExecutionGate(
    ctx.pmStore,
    projectId,
    ctx.questionStore,
    ctx.blockageStore,
  );
  if (gate.gated) return null;

  const next = findNextExecutableWorkItem(ctx.pmStore, projectId);
  if (!next) return null;

  return executeWorkItem(ctx as ExecuteWorkItemContext, next.id);
}
