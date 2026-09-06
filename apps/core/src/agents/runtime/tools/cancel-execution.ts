import { cancelJob, JobControlError } from "../../../application/jobs/job-control.js";
import { syncWorkItemFromJobResult } from "../../../application/pm/execute-work-item.js";
import type { KampakuToolContext } from "./index.js";

export interface CancelExecutionArgs {
  job_id: string;
}

/**
 * Cancel a durable/running job so interruptible executors stop further writes.
 */
export function executeCancelExecution(ctx: KampakuToolContext, args: CancelExecutionArgs) {
  const jobId = args.job_id?.trim();
  if (!jobId) {
    throw new Error("cancel_execution requires job_id.");
  }

  try {
    const result = cancelJob(ctx.store, jobId);
    syncWorkItemFromJobResult(ctx.pmStore, jobId, result.status, undefined, result);
    const job = ctx.store.getJob(jobId)!;
    return {
      jobId,
      jobStatus: job.status,
      resultStatus: result.status,
      cancelled: true,
      summary: `Job ${jobId} cancelled (${job.status}). Interruptible executors must stop further writes.`,
    };
  } catch (error) {
    if (error instanceof JobControlError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export const CANCEL_EXECUTION_TOOL = {
  type: "function" as const,
  function: {
    name: "cancel_execution",
    description:
      "Cancel a job for real. Interruptible durable executors check status between steps and stop writing. Kampaku only.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
};
