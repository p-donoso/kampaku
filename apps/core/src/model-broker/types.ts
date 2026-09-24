import type { ContextTruncation } from "./context-limit.js";

export type { ContextTruncation };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface ChatCompletionResult {
  content: string;
  routedVia?: string;
  model?: string;
  /** Tokens the endpoint reports having read, which is its own view of the prompt. */
  promptTokens?: number;
  /**
   * Set when the endpoint read materially less than was sent, so the reply was produced from a partial
   * prompt. Present only when detected, so its absence means the turn fit.
   */
  truncated?: ContextTruncation;
}

export interface ChatCompletionWithToolsResult {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  model?: string;
  /** Tokens the endpoint reports having read, which is its own view of the prompt. */
  promptTokens?: number;
  /** Set when the endpoint read materially less than was sent. Absent means the turn fit. */
  truncated?: ContextTruncation;
}

export interface ModelBrokerOptions {
  /** No default is applied. Absent means absent, and the constructor says so with a message. */
  baseUrl?: string;
  apiKey?: string;
  model: string;
  /**
   * The endpoint's effective context, when the operator knows it. Without it the broker still detects
   * truncation after the fact and learns the limit from the first one, so configuration is an
   * optimisation rather than a requirement.
   */
  contextTokens?: number;
  /** Tokens held back for the reply. Defaults to `DEFAULT_REPLY_RESERVE_TOKENS`. */
  replyReserveTokens?: number;
}
