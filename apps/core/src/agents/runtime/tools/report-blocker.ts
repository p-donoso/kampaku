import type { KampakuToolContext } from "./index.js";

export interface ReportBlockerArgs {
  agent_slug: string;
  description: string;
  context?: string;
  project_id?: string;
  work_item_id?: string;
}

export function executeReportBlocker(ctx: KampakuToolContext, args: ReportBlockerArgs) {
  if (!ctx.blockageStore) throw new Error("Blocker workflow is not available.");
  const record = ctx.blockageStore.report({
    reportedByAgentId: args.agent_slug,
    description: args.description,
    context: args.context,
    projectId: args.project_id,
    workItemId: args.work_item_id,
  });
  return {
    ...record,
    message:
      "Blocker reported to the agent's direct superior. Related tasks are blocked until it is resolved.",
  };
}

export const REPORT_BLOCKER_TOOL = {
  type: "function" as const,
  function: {
    name: "report_blocker",
    description:
      "Block related tasks and report an unsolvable problem to the agent's direct superior. " +
      "Use when you hit a dependency, bug, skill gap, or external failure you cannot fix. " +
      "The superior may resolve, delegate, convert to a question, or escalate upward.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        description: { type: "string" },
        context: { type: "string" },
        project_id: { type: "string" },
        work_item_id: { type: "string" },
      },
      required: ["agent_slug", "description"],
    },
  },
};
