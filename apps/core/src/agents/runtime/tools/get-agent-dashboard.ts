import type { KampakuToolContext } from "./index.js";
import { getAgentDashboard } from "../../../application/pm/dashboard.js";

export interface GetAgentDashboardArgs {
  agent_slug?: string;
  include_subordinates?: boolean;
}

export function executeGetAgentDashboard(
  ctx: KampakuToolContext,
  args: GetAgentDashboardArgs,
) {
  const slug = args.agent_slug?.trim() || "kampaku";
  const includeSubordinates = args.include_subordinates !== false;

  const dashboard = getAgentDashboard(
    ctx.store,
    ctx.pmStore,
    ctx.agentStore,
    slug,
    includeSubordinates,
  );

  if (!dashboard) {
    throw new Error(`Agent "${slug}" not found.`);
  }

  return dashboard;
}

export const GET_AGENT_DASHBOARD_TOOL = {
  type: "function" as const,
  function: {
    name: "get_agent_dashboard",
    description:
      "Get aggregated work item status for an agent and optionally their subordinates. " +
      "Use when the emperor asks about task status or team progress.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: {
          type: "string",
          description: "Agent slug to inspect. Defaults to kampaku.",
        },
        include_subordinates: {
          type: "boolean",
          description: "Include sub-agents' work items (default true).",
        },
      },
    },
  },
};
