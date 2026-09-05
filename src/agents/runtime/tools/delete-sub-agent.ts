import type { AgentStore } from "../../../persistence/agent-store.js";

export interface DeleteSubAgentArgs {
  slug: string;
}

export interface DeleteSubAgentResult {
  slug: string;
  deleted: true;
}

export function executeDeleteSubAgent(
  store: AgentStore,
  args: DeleteSubAgentArgs,
): DeleteSubAgentResult {
  store.deleteAgent(args.slug);
  return { slug: args.slug, deleted: true };
}

export const DELETE_SUB_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "delete_sub_agent",
    description:
      "Delete a generated sub-agent. The agent must have no children. Built-in kampaku cannot be deleted.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Slug of the agent to delete.",
        },
      },
      required: ["slug"],
    },
  },
};
