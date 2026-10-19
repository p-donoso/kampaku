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
  /**
   * The subset of `skills` authored for the project this seat works for.
   *
   * `skills` alone cannot answer "is this station capable for its aspect": a Terraform station holding
   * thirteen defaults and a Terraform station holding thirteen defaults plus a project-authored network
   * skill both report a non-zero list (BOARD F-022).
   */
  projectSkills?: string[];
  /**
   * Whether this seat's skills reach past the defaults, and the sentence to say when they do not.
   *
   * The roster surface that a staffing reply is written from has to be able to distinguish a station
   * with a capability for its aspect from one holding the eleven `workflow-*` defaults — suite 03's
   * `s3-infra-network` reported 13 skills and none of them about networks (BOARD F-022).
   */
  capability?: { covered: boolean; seed: string[]; project: string[]; note: string };
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
  /**
   * Where the turn's time went, measured per call and per tool.
   *
   * Present on every LLM turn, not only on a stop, because the question the operator asks — *"why did that
   * take eleven minutes?"* — is asked about turns that finished too. `modelLatencyMs` deliberately excludes
   * tool time, and the difference between `elapsedMs` and it is the answer (BOARD F-060).
   */
  accounting?: TurnAccounting;
  contextTruncation?: {
    reportedTokens: number;
    estimatedTokens: number;
    note: string;
  };
}

import type { TurnAccounting } from "./runtime/turn-accounting.js";

export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  projectId?: string;
}

export interface RunKampakuChatOptions {
  onProgress?: ChatProgressCallback;
}

export type { ChatProgressCallback, ChatProgressEvent } from "./runtime/progress.js";
