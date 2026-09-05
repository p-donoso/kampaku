import { retryWorkItem, ExecuteWorkItemError } from "../../../application/pm/execute-work-item.js";
import type { KampakuToolContext } from "./index.js";

export interface RetryWorkItemArgs {
  work_item_id: string;
}

export async function executeRetryWorkItem(
  ctx: KampakuToolContext,
  args: RetryWorkItemArgs,
): Promise<{
  workItemId: string;
  goalId: string;
  jobId: string;
  objective: string;
  repositoryRole: string;
  message: string;
}> {
  try {
    const result = await retryWorkItem(ctx, args.work_item_id);
    return {
      ...result,
      message: `Blocked work item queued for retry. Goal ${result.goalId}, job ${result.jobId}. Worker will pick it up.`,
    };
  } catch (e) {
    if (e instanceof ExecuteWorkItemError) {
      throw new Error(e.message);
    }
    throw e;
  }
}

export const RETRY_WORK_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "retry_work_item",
    description:
      "Retry a blocked work item after a failed execution. Resets the task to todo and queues a fresh goal/job for the worker. Use when a task failed and should run again.",
    parameters: {
      type: "object",
      properties: {
        work_item_id: {
          type: "string",
          description: "UUID of the blocked work item to retry.",
        },
      },
      required: ["work_item_id"],
    },
  },
};
