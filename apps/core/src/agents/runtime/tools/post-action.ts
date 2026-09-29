/**
 * @module runtime/tools/post-action
 * Agent-facing surface for the explicit post-action knowledge projection protocol.
 *
 * The tool is the model-driven path: the reviewing agent supplies structured
 * projections and the runtime applies them as separate, independently
 * retryable mutations.
 */
import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";
import {
  POST_ACTION_EVENTS,
  evaluatePostActionClosure,
  isPostActionEvent,
  isPostActionProjectionName,
  retryPostActionProjection,
  runPostActionReview,
  type PostActionEvent,
  type PostActionReviewInput,
} from "../../../application/pm/post-action/index.js";
import { createModelBroker } from "../../../model-broker/client.js";
import { brokerOptionsFor, resolveModelProviderSettings } from "../../../application/settings/model-provider.js";
import { buildPostActionReviewPrompt } from "../../../application/pm/post-action/review.js";

export interface PostActionResultArgs {
  agent_slug: string;
  event: string;
  project_id: string;
  work_item_id?: string;
  reference_id?: string;
  summary: string;
  decisions?: string[];
  files?: string[];
  checks?: string[];
  acceptance_criteria?: string[];
  follow_ups?: string[];
  /** When true, runs the second low-context model call instead of the deterministic projection. */
  use_model?: boolean;
}

function requireStores(ctx: KampakuToolContext, scope?: ToolRuntimeScope) {
  if (!ctx.postActionStore) throw new Error("Post-action reviews are not available in this runtime.");
  return {
    pmStore: ctx.pmStore,
    agentStore: ctx.agentStore,
    reviewStore: ctx.postActionStore,
    store: ctx.store,
    journalStore: ctx.journalStore,
    memoryStore: ctx.memoryStore,
    wikiStore: ctx.wikiStore,
    scope,
  };
}

function buildInput(ctx: KampakuToolContext, args: PostActionResultArgs): PostActionReviewInput {
  const project = ctx.store.getProject(args.project_id);
  if (!project) throw new Error("Project not found.");
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error("Agent not found.");
  if (!isPostActionEvent(args.event)) {
    throw new Error(`event must be one of: ${POST_ACTION_EVENTS.join(", ")}.`);
  }

  return {
    event: args.event as PostActionEvent,
    agentSlug: agent.slug,
    projectId: project.id,
    workItemId: args.work_item_id,
    referenceId: args.reference_id,
    summary: args.summary,
    decisions: args.decisions,
    files: args.files,
    checks: args.checks,
    acceptanceCriteria: args.acceptance_criteria,
    followUps: args.follow_ups,
    wikiPages: ctx.wikiStore
      ?.listPagesByProject(project.id)
      .filter((page) => page.status !== "archived")
      .map((page) => ({ slug: page.slug, title: page.title, status: page.status })),
    wikiSyncRequired: project.wikiSyncRequired === true,
  };
}

export async function executePostActionReview(
  ctx: KampakuToolContext,
  args: PostActionResultArgs,
) {
  const stores = requireStores(ctx);
  const input = buildInput(ctx, args);

  if (args.use_model !== true) {
    const { runPostActionReviewSync } = await import(
      "../../../application/pm/post-action/index.js"
    );
    return runPostActionReviewSync(stores, input);
  }

  const provider = resolveModelProviderSettings(ctx.store, ctx.config);
  // Projection of work already recorded: execution effort, not planning effort.
  const broker = createModelBroker(brokerOptionsFor("execution", ctx.config, provider));
  return runPostActionReview(stores, input, {
    delegate: {
      run: async (reviewInput) => {
        const response = await broker.chat([
          { role: "system", content: "You project already-recorded work into durable knowledge. Reply with one JSON object only." },
          { role: "user", content: buildPostActionReviewPrompt(reviewInput) },
        ]);
        return response.content;
      },
    },
  });
}

export interface RetryPostActionArgs {
  agent_slug: string;
  review_id: string;
  projection: string;
}

export function executeRetryPostActionProjection(
  ctx: KampakuToolContext,
  args: RetryPostActionArgs,
) {
  const stores = requireStores(ctx);
  if (!isPostActionProjectionName(args.projection)) {
    throw new Error("projection must be journal, memory, or wiki.");
  }
  ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  return retryPostActionProjection(stores, args.review_id, args.projection);
}

export interface PostActionClosureArgs {
  agent_slug: string;
  project_id: string;
}

export function executeGetPostActionClosure(ctx: KampakuToolContext, args: PostActionClosureArgs) {
  const stores = requireStores(ctx);
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error("Agent not found.");
  const project = ctx.store.getProject(args.project_id);
  if (!project) throw new Error("Project not found.");
  return evaluatePostActionClosure(stores, {
    projectId: project.id,
    agentSlug: agent.slug,
    wikiSyncRequired: project.wikiSyncRequired === true,
  });
}

export const POST_ACTION_REVIEW_TOOL = {
  type: "function" as const,
  function: {
    name: "post_action_review",
    description:
      "Project a meaningful completed action into durable knowledge. Use after work completion, delegation, blocker resolution, handoff, failure, phase completion, wiki review, or a repository change. Each channel (journal, memory, wiki) is projected separately and may be explicitly not_needed.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Your agent slug." },
        event: {
          type: "string",
          enum: [...POST_ACTION_EVENTS],
          description: "Lifecycle event being projected.",
        },
        project_id: { type: "string", description: "Project UUID." },
        work_item_id: { type: "string", description: "Optional work item UUID to anchor the projection." },
        reference_id: { type: "string", description: "Optional event reference: job, blocker, question, handoff, or page id." },
        summary: { type: "string", description: "Recorded outcome. State only what actually happened." },
        decisions: { type: "array", items: { type: "string" } },
        files: { type: "array", items: { type: "string" } },
        checks: { type: "array", items: { type: "string" }, description: "Check name and pass/fail state." },
        acceptance_criteria: { type: "array", items: { type: "string" } },
        follow_ups: { type: "array", items: { type: "string" } },
        use_model: {
          type: "boolean",
          description: "Run the second low-context model call instead of deriving the projection from recorded facts.",
        },
      },
      required: ["agent_slug", "event", "project_id", "summary"],
    },
  },
};

export const RETRY_POST_ACTION_PROJECTION_TOOL = {
  type: "function" as const,
  function: {
    name: "retry_post_action_projection",
    description:
      "Retry one failed post-action projection without re-running the completed work.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        review_id: { type: "string", description: "Post-action review UUID." },
        projection: { type: "string", enum: ["journal", "memory", "wiki"] },
      },
      required: ["agent_slug", "review_id", "projection"],
    },
  },
};

export const GET_POST_ACTION_CLOSURE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_post_action_closure",
    description:
      "Report per-channel post-action closure evidence for a project: superior journal, private memory, and required shared wiki, listing what is missing.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        project_id: { type: "string" },
      },
      required: ["agent_slug", "project_id"],
    },
  },
};
