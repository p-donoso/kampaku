import { KAMPAKU_AGENT_ID } from "../../agents/definitions.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { Store, JobResultRecord } from "../../persistence/store.js";

export const FREELLMAPI_INITIAL_TIMEOUT_CODE = "FREELLMAPI_INITIAL_TIMEOUT";
export const WORKER_INCOMPLETE_MUTATIONS_CODE = "WORKER_INCOMPLETE_MUTATIONS";
export const WORKER_NO_DELIVERABLES_CODE = "WORKER_NO_DELIVERABLES";

const ESCALATABLE_JOB_ERROR_CODES = new Set<string>([
  FREELLMAPI_INITIAL_TIMEOUT_CODE,
  WORKER_INCOMPLETE_MUTATIONS_CODE,
  WORKER_NO_DELIVERABLES_CODE,
]);

function errorCode(result: JobResultRecord): string | undefined {
  const error = result.error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

function resolveReportingAgentId(
  workItem: WorkItemRecord,
  store: Store,
  agentStore: AgentStore,
): string | undefined {
  if (workItem.assigneeAgentId) {
    const assignee = agentStore.getAgentBySlugOrId(workItem.assigneeAgentId);
    if (assignee?.parentId) return assignee.id;
  }

  const project = store.getProject(workItem.projectId);
  if (project?.projectLeadAgentId) {
    const lead = agentStore.getAgentBySlugOrId(project.projectLeadAgentId);
    if (lead?.parentId) return lead.id;
  }

  const kampaku = agentStore.getAgentBySlugOrId(KAMPAKU_AGENT_ID);
  return kampaku?.parentId ? kampaku.id : undefined;
}

function buildBlockerDescription(result: JobResultRecord): string {
  const error = (result.error ?? {}) as Record<string, unknown>;
  if (errorCode(result) === WORKER_INCOMPLETE_MUTATIONS_CODE) {
    const failedMutations = typeof error.failedMutations === "number" ? error.failedMutations : undefined;
    const detail =
      typeof error.message === "string"
        ? error.message
        : "The coding worker could not apply required file changes in the repository.";
    return failedMutations && failedMutations > 0
      ? `${detail} (${failedMutations} failed write/replace attempt${failedMutations === 1 ? "" : "s"}).`
      : detail;
  }
  if (errorCode(result) === WORKER_NO_DELIVERABLES_CODE) {
    return typeof error.message === "string"
      ? error.message
      : "The coding worker finished without writing or updating any files in the repository.";
  }
  if (errorCode(result) === FREELLMAPI_INITIAL_TIMEOUT_CODE) {
    const attempts = typeof error.attempts === "number" ? error.attempts : 3;
    const timeoutMs = typeof error.timeoutMs === "number" ? error.timeoutMs : 120_000;
    const timeoutSec = Math.round(timeoutMs / 1000);
    return (
      `FreeLLMApi did not respond within ${timeoutSec}s after ${attempts} attempts. ` +
      "The coding worker cannot continue until the model API is reachable and responds."
    );
  }

  const message = typeof error.message === "string" ? error.message : "Job execution failed.";
  return message;
}

function blockerMatchesJobFailure(description: string, code: string): boolean {
  if (code === FREELLMAPI_INITIAL_TIMEOUT_CODE) {
    return description.startsWith("FreeLLMApi did not respond");
  }
  if (code === WORKER_INCOMPLETE_MUTATIONS_CODE) {
    return description.includes("file write/replace attempts failed") || description.includes("could not apply required file changes");
  }
  if (code === WORKER_NO_DELIVERABLES_CODE) {
    return description.includes("without writing or updating any files");
  }
  return false;
}

function buildBlockerContext(result: JobResultRecord): string | undefined {
  const error = result.error;
  if (!error) return undefined;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return undefined;
  }
}

export function escalateFailedJobToBlocker(
  ctx: {
    store: Store;
    pmStore: PmStore;
    agentStore: AgentStore;
    blockageStore?: BlockageStore;
  },
  workItem: WorkItemRecord,
  result: JobResultRecord,
): void {
  if (result.status !== "failed") return;
  const code = errorCode(result);
  if (!code || !ESCALATABLE_JOB_ERROR_CODES.has(code)) return;
  if (!ctx.blockageStore) return;

  const reporterId = resolveReportingAgentId(workItem, ctx.store, ctx.agentStore);
  if (!reporterId) return;

  const pending = ctx.blockageStore
    .listPending()
    .some((blocker) => blocker.workItemId === workItem.id && blockerMatchesJobFailure(blocker.description, code));
  if (pending) return;

  ctx.blockageStore.report({
    reportedByAgentId: reporterId,
    description: buildBlockerDescription(result),
    context: buildBlockerContext(result),
    projectId: workItem.projectId,
    workItemId: workItem.id,
  });
}
