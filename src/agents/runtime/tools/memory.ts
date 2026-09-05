import type { MemoryKind } from "../../../persistence/memory-store.js";
import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";

export interface RecallArgs { query?: string; kind?: MemoryKind; limit?: number; project_id?: string }
export interface RememberArgs {
  title: string; body: string; summary?: string; relevance?: number;
  project_id?: string; work_item_id?: string; metadata?: Record<string, unknown>;
}

export const RECALL_TOOL = {
  type: "function" as const,
  function: {
    name: "recall",
    description: "Recall this agent's persistent logs and condensed learnings from prior independent chat sessions. Use when past experience, decisions, context, or known pitfalls could improve the current work.",
    parameters: { type: "object", properties: {
      query: { type: "string", description: "Optional words to search in titles, bodies, and summaries." },
      kind: { type: "string", enum: ["log", "learning"], description: "Optional memory type filter." },
      project_id: { type: "string", description: "Optional project scope." },
      limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
    } },
  },
};

function rememberTool(kind: MemoryKind, name: string, description: string) {
  return {
    type: "function" as const,
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, specific title." },
          body: { type: "string", description: kind === "log" ? "Agent-written task record: outcome, decisions, and relevant context." : "Condensed, reusable lesson stated in the agent's own words." },
          summary: { type: "string", description: "Optional one-line retrieval summary." },
          relevance: { type: "integer", minimum: 1, maximum: 5, description: "Expected future usefulness." },
          project_id: { type: "string" },
          work_item_id: { type: "string" },
          metadata: { type: "object", additionalProperties: true },
        },
        required: ["title", "body"],
      },
    },
  };
}

export const REMEMBER_LOG_TOOL = rememberTool("log", "remember_log", "Store a durable task log after meaningful work, decisions, results, or blockers. Write it in your own concise words.");
export const REMEMBER_LEARNING_TOOL = rememberTool("learning", "remember_learning", "Store a highly condensed, reusable learning after evaluating that it will improve future work. Avoid session-specific trivia.");

export function executeRecall(ctx: KampakuToolContext, scope: ToolRuntimeScope, args: RecallArgs) {
  return { memories: ctx.memoryStore.list({ agentId: scope.agentId, kind: args.kind, query: args.query,
    projectId: args.project_id, limit: args.limit ?? 10, recordAccess: true }) };
}

export function executeRemember(ctx: KampakuToolContext, scope: ToolRuntimeScope, kind: MemoryKind, args: RememberArgs) {
  return ctx.memoryStore.create({ agentId: scope.agentId, kind, title: args.title, body: args.body,
    summary: args.summary, relevance: args.relevance, projectId: args.project_id ?? scope.projectId,
    conversationId: scope.conversationId, workItemId: args.work_item_id, metadata: args.metadata });
}
