import type { KampakuToolContext } from "./index.js";

export interface ResolveBlockerArgs {
  blocker_id: string;
  agent_slug: string;
  resolution: string;
}

export interface EscalateBlockerArgs {
  blocker_id: string;
  agent_slug: string;
}

export interface ConvertBlockerToQuestionArgs {
  blocker_id: string;
  agent_slug: string;
}

export interface DelegateBlockerArgs {
  blocker_id: string;
  agent_slug: string;
  title: string;
  assignee_agent_slug: string;
  description?: string;
  parent_id?: string;
}

function resolveAgentId(ctx: KampakuToolContext, slug: string): string {
  const agent = ctx.agentStore.getAgentBySlugOrId(slug);
  if (!agent) throw new Error(`Agent "${slug}" not found.`);
  return agent.id;
}

export function executeResolveBlocker(ctx: KampakuToolContext, args: ResolveBlockerArgs) {
  if (!ctx.blockageStore) throw new Error("Blocker workflow is not available.");
  const agentId = resolveAgentId(ctx, args.agent_slug);
  return ctx.blockageStore.resolve(args.blocker_id, args.resolution, agentId);
}

export function executeEscalateBlocker(ctx: KampakuToolContext, args: EscalateBlockerArgs) {
  if (!ctx.blockageStore) throw new Error("Blocker workflow is not available.");
  const agentId = resolveAgentId(ctx, args.agent_slug);
  return ctx.blockageStore.escalate(args.blocker_id, agentId);
}

export function executeConvertBlockerToQuestion(
  ctx: KampakuToolContext,
  args: ConvertBlockerToQuestionArgs,
) {
  if (!ctx.blockageStore || !ctx.questionStore) {
    throw new Error("Blocker and question workflows are not available.");
  }
  const agentId = resolveAgentId(ctx, args.agent_slug);
  return ctx.blockageStore.convertToQuestion(args.blocker_id, agentId, ctx.questionStore);
}

export function executeDelegateBlocker(ctx: KampakuToolContext, args: DelegateBlockerArgs) {
  if (!ctx.blockageStore) throw new Error("Blocker workflow is not available.");
  const agentId = resolveAgentId(ctx, args.agent_slug);
  const assignee = ctx.agentStore.getAgentBySlugOrId(args.assignee_agent_slug);
  if (!assignee) throw new Error(`Assignee agent "${args.assignee_agent_slug}" not found.`);
  return ctx.blockageStore.delegate(args.blocker_id, agentId, {
    title: args.title,
    assigneeAgentId: assignee.id,
    description: args.description,
    parentId: args.parent_id,
  });
}

export const RESOLVE_BLOCKER_TOOL = {
  type: "function" as const,
  function: {
    name: "resolve_blocker",
    description:
      "Resolve a pending blocker with instructions for the reporting agent. Only the current recipient can resolve.",
    parameters: {
      type: "object",
      properties: {
        blocker_id: { type: "string" },
        agent_slug: { type: "string", description: "Slug of the manager resolving the blocker." },
        resolution: { type: "string" },
      },
      required: ["blocker_id", "agent_slug", "resolution"],
    },
  },
};

export const ESCALATE_BLOCKER_TOOL = {
  type: "function" as const,
  function: {
    name: "escalate_blocker",
    description:
      "Escalate a pending blocker to your superior when you cannot resolve it locally. Only the current recipient can escalate.",
    parameters: {
      type: "object",
      properties: {
        blocker_id: { type: "string" },
        agent_slug: { type: "string", description: "Slug of the manager escalating the blocker." },
      },
      required: ["blocker_id", "agent_slug"],
    },
  },
};

export const CONVERT_BLOCKER_TO_QUESTION_TOOL = {
  type: "function" as const,
  function: {
    name: "convert_blocker_to_question",
    description:
      "Convert a pending blocker into a question when the issue is really a missing decision or information need.",
    parameters: {
      type: "object",
      properties: {
        blocker_id: { type: "string" },
        agent_slug: { type: "string", description: "Slug of the manager converting the blocker." },
      },
      required: ["blocker_id", "agent_slug"],
    },
  },
};

export const DELEGATE_BLOCKER_TOOL = {
  type: "function" as const,
  function: {
    name: "delegate_blocker",
    description:
      "Resolve a blocker by creating a new work item assigned to another agent. Only the current recipient can delegate.",
    parameters: {
      type: "object",
      properties: {
        blocker_id: { type: "string" },
        agent_slug: { type: "string", description: "Slug of the manager delegating the blocker." },
        title: { type: "string" },
        assignee_agent_slug: { type: "string" },
        description: { type: "string" },
        parent_id: { type: "string", description: "Optional parent work item ID. Defaults to the blocker's work item." },
      },
      required: ["blocker_id", "agent_slug", "title", "assignee_agent_slug"],
    },
  },
};
