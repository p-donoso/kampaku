import type { ChatProgressCallback } from "./runtime/progress.js";

export type AgentSource = "builtin" | "bootstrap" | "generated";
export type AgentStatus = "active" | "archived";

export interface AgentRecord {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  source: AgentSource;
  responsibilities: string;
  systemPrompt: string;
  status: AgentStatus;
  skills?: string[];
  createdAt: string;
}

export interface AgentTreeNode {
  agent: AgentRecord;
  children: AgentTreeNode[];
}

export interface BuiltinAgentDefinition {
  slug: string;
  name: string;
  description: string;
  immutable: boolean;
  tools: string[];
  systemPrompt: string;
}

export interface CreateSubAgentInput {
  slug: string;
  name: string;
  responsibilities: string;
  systemPrompt: string;
  parentId: string;
  source?: Exclude<AgentSource, "builtin">;
}

export interface UpdateSubAgentInput {
  name?: string;
  responsibilities?: string;
  systemPrompt?: string;
  parentId?: string;
}

export interface AgentChatResponse {
  reply: string;
  conversationId: string;
  toolsUsed?: string[];
  agentUsed?: "llm" | "stub";
  model?: string;
  /**
   * Assertions in `reply` that durable state does not support, checked around this turn.
   * Present only when something was found, so its absence means "nothing contradicted the reply".
   */
  unverifiedClaims?: Array<{
    claim: string;
    evidence: string;
    severity: "high" | "medium";
  }>;
  /**
   * Set when the endpoint read materially less of the prompt than was sent.
   *
   * Present only when detected, so its absence means the turn fit. When it is set, the reply was
   * produced from a partial prompt: it describes the part the model saw, and the turn is not a valid
   * measurement of the product. Five baseline runs were scored without this and were measuring an
   * endpoint that was discarding the front of every turn.
   */
  /**
   * Set when the turn stopped at its own wall-clock budget instead of finishing.
   *
   * Present only when it happened, so its absence means the turn ended on its own terms. When it is
   * set the reply says so in words as well, and the two must agree: an operator who reads the reply
   * and an operator who reads the meta are looking at one fact. A budget reported nowhere is the
   * silent failure this field exists to remove — measured 2026-09-25, a turn that ran 40 minutes and
   * returned nothing (BOARD F-048).
   */
  budgetExhausted?: {
    modelCalls: number;
    elapsedMs: number;
    budgetMs: number;
  };
  contextTruncation?: {
    reportedTokens: number;
    estimatedTokens: number;
    note: string;
  };
}

export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  projectId?: string;
}

export interface RunKampakuChatOptions {
  onProgress?: ChatProgressCallback;
}

export type { ChatProgressCallback, ChatProgressEvent } from "./runtime/progress.js";
