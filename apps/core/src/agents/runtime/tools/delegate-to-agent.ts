import type { KampakuToolContext } from "./index.js";

export interface DelegateToAgentArgs {
  agent_slug: string;
  objective: string;
  project_slug?: string;
}

export async function executeDelegateToAgent(
  ctx: KampakuToolContext,
  args: DelegateToAgentArgs,
) {
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error(`Agent "${args.agent_slug}" not found.`);
  if (agent.slug === "kampaku") throw new Error("Kampaku cannot delegate a session to itself.");

  const project = args.project_slug
    ? ctx.store.getProjectByIdOrSlug(args.project_slug)
    : undefined;
  const { runSubAgentSession } = await import("../sub-agent-session.js");
  const result = await runSubAgentSession(ctx, agent, args.objective, project?.id);

  return {
    agentSlug: agent.slug,
    projectId: project?.id,
    ...result,
  };
}

export const DELEGATE_TO_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "delegate_to_agent",
    description:
      "Dispatch an autonomous session to an existing responsible agent. Use it to have a project lead approve and apply a plan, link a repository, start execution, or resolve project work through that agent's authorized skills.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Responsible agent slug." },
        objective: {
          type: "string",
          description: "Complete English objective, including known ids, decisions, constraints, and required evidence.",
        },
        project_slug: { type: "string", description: "Existing project slug when available." },
      },
      required: ["agent_slug", "objective"],
    },
  },
};
