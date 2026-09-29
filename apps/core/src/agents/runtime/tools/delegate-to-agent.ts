import type { KampakuToolContext } from "./index.js";

export interface DelegateToAgentArgs {
  agent_slug: string;
  objective: string;
  project_slug?: string;
}

export async function executeDelegateToAgent(
  ctx: KampakuToolContext,
  args: DelegateToAgentArgs,
  scope?: { deadlineAt?: number },
) {
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error(`Agent "${args.agent_slug}" not found.`);
  if (agent.slug === "kampaku") throw new Error("Kampaku cannot delegate a session to itself.");

  const project = args.project_slug
    ? ctx.store.getProjectByIdOrSlug(args.project_slug)
    : undefined;
  const { runSubAgentSession } = await import("../sub-agent-session.js");
  // The turn's deadline, not a new one: a delegated session spends the budget the emperor's turn is
  // already spending. See `ToolRuntimeScope.deadlineAt`.
  const result = await runSubAgentSession(ctx, agent, args.objective, project?.id, scope?.deadlineAt);

  return {
    agentSlug: agent.slug,
    projectId: project?.id,
    // What the delegated session spent, handed back so the front office's turn can count it. Without this the
    // turn reports its own one or two calls for a delegation that made dozens, which is BOARD F-060 measured
    // in run 16: *"1 model calls and 1 tool calls"* for a turn whose session made 5 and 17.
    usage: { modelCalls: result.modelCalls, elapsedMs: result.elapsedMs },
    ...result,
  };
}

export const DELEGATE_TO_AGENT_TOOL = {
  type: "function" as const,
  function: {
    name: "delegate_to_agent",
    description:
      "Dispatch an autonomous session to an existing responsible agent. Use it to have a project lead author, approve and apply a plan, link a repository, start execution, or resolve project work through that agent's authorized skills. Applying a plan persists its steps and runs nothing, so to produce a plan without executing it, ask the lead for exactly that in the objective: read the repository, write the plan against its own toolchain, apply it, and stop before execution.",
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
