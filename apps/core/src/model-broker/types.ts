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
   * How much of the endpoint's reasoning budget one call may spend, or nothing.
   *
   * **Not validated and not translated.** The vocabulary is not portable — OpenAI spells it
   * `low | medium | high`, DeepSeek `low | high | max`, and a router in front of both forwards whatever it
   * was handed — so the value an operator sets is the value the endpoint receives. A word the endpoint
   * does not know is its refusal to make, and `ModelBroker` turns that refusal into a message naming the
   * two settings that would stop it, rather than quietly dropping the parameter and reporting nothing.
   *
   * Absent means the request carries no `reasoning_effort` field at all and the endpoint decides. See
   * `docs/concepts/token-economy.md` for why the two roles default differently.
   */
  reasoningEffort?: ReasoningEffort;
  /**
   * The endpoint's effective context, when the operator knows it. Without it the broker still detects
   * truncation after the fact and learns the limit from the first one, so configuration is an
   * optimisation rather than a requirement.
   */
  contextTokens?: number;
  /** Tokens held back for the reply. Defaults to `DEFAULT_REPLY_RESERVE_TOKENS`. */
  replyReserveTokens?: number;
}

/**
 * The endpoint's own word for its reasoning budget, passed through unchanged.
 *
 * Deliberately a string rather than an enum: an enum would claim a vocabulary the protocol does not have,
 * and would turn a word a future endpoint supports into a type error instead of a request.
 */
export type ReasoningEffort = string;
