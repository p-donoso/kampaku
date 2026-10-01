import type { AppConfig } from "../../config.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { ConversationStore } from "../../persistence/conversation-store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
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
  ensureBlockerTriageForPendingBlockers,
  executeBlockerTriageWorkItem,
  findNextBlockerTriageWorkItem,
  hasPendingBlockerForWorkItem,
  isBlockerTriageWorkItem,
  type BlockerTriageContext,
} from "./blocker-triage.js";
import {
  findHeadBlockingWorkItem,
  getProjectExecutionGate,
  type ProjectExecutionGate,
} from "./project-execution-gate.js";
import {
  findNextExecutableWorkItem,
  findNextStepWorkItem,
  previewNextStep,
  projectAutoExecuteKey,
} from "./work-item-order.js";
import { findNextPhaseGateWorkItem } from "./phase-auditor-gate.js";
import { applyExpiredJobHygiene } from "./queue-hygiene.js";

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
  conversationStore?: ConversationStore;
  memoryStore?: MemoryStore;
  journalStore?: JournalStore;
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

function syncQueueHygiene(ctx: ExecuteProjectContext): void {
  applyExpiredJobHygiene(ctx.store, ctx.pmStore, ctx.journalStore, ctx.memoryStore, {
    agentStore: ctx.agentStore,
    store: ctx.store,
  });
}

function syncBlockerTriageWorkItems(ctx: ExecuteProjectContext, projectId: string): void {
  if (!ctx.blockageStore) return;
  ensureBlockerTriageForPendingBlockers(ctx.pmStore, ctx.agentStore, ctx.blockageStore, projectId);
}

async function startProjectWorkItem(
  ctx: ExecuteProjectContext,
  workItemId: string,
): Promise<ExecuteWorkItemResult> {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (workItem && isBlockerTriageWorkItem(workItem)) {
    if (!ctx.conversationStore || !ctx.memoryStore || !ctx.blockageStore) {
      throw new ExecuteProjectError(
        "Blocker triage requires conversation, memory, and blocker stores.",
        "VALIDATION",
      );
    }
    const triageCtx: BlockerTriageContext = {
      store: ctx.store,
      pmStore: ctx.pmStore,
      agentStore: ctx.agentStore,
      skillStore: ctx.skillStore,
      config: ctx.config,
      conversationStore: ctx.conversationStore,
      memoryStore: ctx.memoryStore,
      questionStore: ctx.questionStore,
      blockageStore: ctx.blockageStore,
      journalStore: ctx.journalStore,
    };
    return executeBlockerTriageWorkItem(triageCtx, workItemId);
  }

  return executeWorkItem(ctx as ExecuteWorkItemContext, workItemId);
}

async function startProjectWorkItemWithFollowUp(
  ctx: ExecuteProjectContext,
  workItemId: string,
): Promise<ExecuteWorkItemResult> {
  const started = await startProjectWorkItem(ctx, workItemId);
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (workItem && isBlockerTriageWorkItem(workItem) && workItem.status === "done") {
    const next = await advanceProjectIfAutoExecuting(ctx, workItem.projectId);
    return next ?? started;
  }
  return started;
}

export function getProjectExecutionState(
  ctx: Pick<
    ExecuteProjectContext,
    "store" | "pmStore" | "questionStore" | "blockageStore" | "journalStore" | "agentStore"
  >,
  projectId: string,
): {
  autoExecute: boolean;
  gate: ProjectExecutionGate;
  nextStep: ReturnType<typeof previewNextStep>;
} {
  return {
    autoExecute: isProjectAutoExecuting(ctx.store, projectId),
    gate: getProjectExecutionGate(
      ctx.pmStore,
      projectId,
      ctx.questionStore,
      ctx.blockageStore,
      ctx.journalStore,
      ctx.agentStore,
    ),
    nextStep: previewNextStep(ctx.pmStore, projectId),
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
  syncQueueHygiene(ctx);
  syncBlockerTriageWorkItems(ctx, project.id);

  const triage = findNextBlockerTriageWorkItem(ctx.pmStore, ctx.blockageStore, project.id);
  if (triage) {
    const started = await startProjectWorkItemWithFollowUp(ctx, triage.id);
    return { autoExecute: true, started, nextWorkItemId: triage.id };
  }

  const phaseGate = findNextPhaseGateWorkItem(ctx.pmStore, project.id);
  if (phaseGate && phaseGate.status === "todo") {
    const started = await startProjectWorkItem(ctx, phaseGate.id);
    return { autoExecute: true, started, nextWorkItemId: phaseGate.id };
  }

  const gate = getProjectExecutionGate(
    ctx.pmStore,
    project.id,
    ctx.questionStore,
    ctx.blockageStore,
    ctx.journalStore,
    ctx.agentStore,
  );
  if (gate.gated) {
    if (gate.reason === "blocked_task") {
      const blockingTask = findHeadBlockingWorkItem(ctx.pmStore, project.id);
      if (
        blockingTask &&
        !hasPendingBlockerForWorkItem(ctx.blockageStore, blockingTask.id)
      ) {
        const started = await retryWorkItem(ctx as ExecuteWorkItemContext, blockingTask.id);
        return { autoExecute: true, started, nextWorkItemId: blockingTask.id };
      }
    }
    return { autoExecute: true, gated: true, gate, nextWorkItemId: null };
  }

  const next = findNextExecutableWorkItem(ctx.pmStore, project.id, ctx.blockageStore);
  if (!next) {
    return { autoExecute: true, nextWorkItemId: null };
  }

  const started = await startProjectWorkItem(ctx, next.id);
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

export async function stepProject(
  ctx: ExecuteProjectContext,
  idOrSlug: string,
): Promise<{
  autoExecute: false;
  gated?: boolean;
  gate?: ProjectExecutionGate;
  started?: ExecuteWorkItemResult;
  nextWorkItemId?: string | null;
  activeTrackId?: string | null;
  activeTrackTitle?: string | null;
}> {
  const project = resolveProject(ctx.store, idOrSlug);
  setProjectAutoExecuting(ctx.store, project.id, false);
  syncQueueHygiene(ctx);
  syncBlockerTriageWorkItems(ctx, project.id);

  const triage = findNextBlockerTriageWorkItem(ctx.pmStore, ctx.blockageStore, project.id);
  if (triage) {
    const started = await startProjectWorkItemWithFollowUp(ctx, triage.id);
    return {
      autoExecute: false,
      started,
      nextWorkItemId: triage.id,
      activeTrackTitle: triage.title,
    };
  }

  const phaseGate = findNextPhaseGateWorkItem(ctx.pmStore, project.id);
  if (phaseGate && phaseGate.status === "todo") {
    const started = await startProjectWorkItem(ctx, phaseGate.id);
    return {
      autoExecute: false,
      started,
      nextWorkItemId: phaseGate.id,
      activeTrackTitle: phaseGate.title,
    };
  }

  const gate = getProjectExecutionGate(
    ctx.pmStore,
    project.id,
    ctx.questionStore,
    ctx.blockageStore,
    ctx.journalStore,
    ctx.agentStore,
  );
  if (gate.gated) {
    if (gate.reason === "blocked_task") {
      const blockingTask = findHeadBlockingWorkItem(ctx.pmStore, project.id);
      if (
        blockingTask &&
        !hasPendingBlockerForWorkItem(ctx.blockageStore, blockingTask.id)
      ) {
        const started = await retryWorkItem(ctx as ExecuteWorkItemContext, blockingTask.id);
        return {
          autoExecute: false,
          started,
          nextWorkItemId: blockingTask.id,
          activeTrackTitle: blockingTask.title,
        };
      }
    }
    return { autoExecute: false, gated: true, gate, nextWorkItemId: null };
  }

  const step = findNextStepWorkItem(ctx.pmStore, project.id);
  if (!step) {
    return { autoExecute: false, nextWorkItemId: null };
  }

  const started = await startProjectWorkItem(ctx, step.workItem.id);
  return {
    autoExecute: false,
    started,
    nextWorkItemId: step.workItem.id,
    activeTrackId: step.track.id,
    activeTrackTitle: step.track.title,
  };
}

export async function advanceProjectIfAutoExecuting(
  ctx: ExecuteProjectContext,
  projectId: string,
): Promise<ExecuteWorkItemResult | null> {
  if (!isProjectAutoExecuting(ctx.store, projectId)) return null;

  syncQueueHygiene(ctx);
  syncBlockerTriageWorkItems(ctx, projectId);

  const triage = findNextBlockerTriageWorkItem(ctx.pmStore, ctx.blockageStore, projectId);
  if (triage) {
    return startProjectWorkItemWithFollowUp(ctx, triage.id);
  }

  const phaseGate = findNextPhaseGateWorkItem(ctx.pmStore, projectId);
  if (phaseGate && phaseGate.status === "todo") {
    return startProjectWorkItem(ctx, phaseGate.id);
  }

  const gate = getProjectExecutionGate(
    ctx.pmStore,
    projectId,
    ctx.questionStore,
    ctx.blockageStore,
    ctx.journalStore,
    ctx.agentStore,
  );
  if (gate.gated) return null;

  const next = findNextExecutableWorkItem(ctx.pmStore, projectId, ctx.blockageStore);
  if (!next) return null;

  return startProjectWorkItem(ctx, next.id);
}
