import { executeWorkItem, ExecuteWorkItemError } from "../../../application/pm/execute-work-item.js";
import type { KampakuToolContext } from "./index.js";

export interface ExecuteWorkItemArgs {
  work_item_id: string;
}

export async function executeExecuteWorkItem(
  ctx: KampakuToolContext,
  args: ExecuteWorkItemArgs,
): Promise<{
  workItemId: string;
  goalId: string;
  jobId: string;
  objective: string;
  repositoryRole: string;
  message: string;
}> {
  try {
    const result = await executeWorkItem(ctx, args.work_item_id);
    return {
      ...result,
      message: `Work item queued for execution. Goal ${result.goalId}, job ${result.jobId}. Worker will pick it up.`,
    };
  } catch (e) {
    if (e instanceof ExecuteWorkItemError) {
      throw new Error(e.message);
    }
    throw e;
  }
}

export const EXECUTE_WORK_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "execute_work_item",
    description:
      "Start executing a work item (micro-task). Creates a goal and queues a job for the worker. Use when the user asks to run, start, or execute a task. Only leaf items in todo status can be executed. For blocked tasks, use retry_work_item instead.",
    parameters: {
      type: "object",
      properties: {
        work_item_id: {
          type: "string",
          description: "UUID of the work item to execute.",
        },
      },
      required: ["work_item_id"],
    },
  },
};
