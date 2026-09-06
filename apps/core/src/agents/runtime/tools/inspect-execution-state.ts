import type { KampakuToolContext } from "./index.js";

export interface InspectExecutionStateArgs {
  job_id?: string;
  work_item_id?: string;
  project_slug_or_id?: string;
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "expired"]);

/**
 * Honest job/work execution status after interrupt or restart.
 * Does not invent "still running" when the job is expired/cancelled.
 */
export function executeInspectExecutionState(
  ctx: KampakuToolContext,
  args: InspectExecutionStateArgs,
) {
  let jobId = args.job_id?.trim();
  let workItem = args.work_item_id?.trim()
    ? ctx.pmStore.getWorkItem(args.work_item_id.trim())
    : undefined;

  if (!jobId && workItem?.jobId) {
    jobId = workItem.jobId;
  }

  if (!jobId && args.project_slug_or_id?.trim()) {
    const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
    if (!project) {
      throw new Error(`Project "${args.project_slug_or_id}" not found.`);
    }
    const items = ctx.pmStore
      .listWorkItemsByProject(project.id)
      .filter((item) => item.jobId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    workItem = items[0];
    jobId = workItem?.jobId;
  }

  if (!jobId) {
    throw new Error("inspect_execution_state requires job_id, work_item_id, or project_slug_or_id with a linked job.");
  }

  const job = ctx.store.getJob(jobId);
  if (!job) {
    throw new Error(`Job "${jobId}" not found.`);
  }
  const result = ctx.store.getJobResult(jobId);
  const logs = ctx.store.listJobLogs(jobId, 10);
  if (!workItem) {
    workItem = ctx.pmStore.listAllWorkItems().find((item) => item.jobId === jobId);
  }

  const terminal = TERMINAL.has(job.status);
  const lost =
    job.status === "expired" ||
    (result?.error &&
      typeof result.error === "object" &&
      (result.error as { code?: string }).code === "PROCESS_RESTART");

  let resumeAllowed = false;
  let lossSummary: string | undefined;
  if (job.status === "paused") {
    resumeAllowed = true;
  } else if (lost || job.status === "expired") {
    lossSummary =
      "Job is expired/lost after interrupt or restart. Do not claim it is still running. Start a fresh durable execution if needed.";
    resumeAllowed = false;
  } else if (job.status === "cancelled") {
    lossSummary = "Job was cancelled; further writes should have stopped.";
    resumeAllowed = false;
  }

  return {
    jobId: job.id,
    jobStatus: job.status,
    terminal,
    lost: Boolean(lost),
    resumeAllowed,
    lossSummary,
    workItem: workItem
      ? { id: workItem.id, title: workItem.title, status: workItem.status }
      : null,
    error: result?.error ?? null,
    output: result?.output ?? null,
    recentLogs: logs.map((entry) => entry.line),
    summary: terminal
      ? `Job ${job.id} is terminal: ${job.status}${lost ? " (lost/expired — not running)" : ""}.`
      : `Job ${job.id} is ${job.status}.`,
  };
}

export const INSPECT_EXECUTION_STATE_TOOL = {
  type: "function" as const,
  function: {
    name: "inspect_execution_state",
    description:
      "Report truthful job/work execution status (running, paused, succeeded, failed, cancelled, expired/lost). Use after restart or interrupt. Do not claim green running when the job is expired. Kampaku only.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        work_item_id: { type: "string" },
        project_slug_or_id: { type: "string" },
      },
    },
  },
};
