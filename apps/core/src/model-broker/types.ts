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

export interface ModelCallMeasurement {
  /**
   * Wall clock across every attempt of this one call, including the ones that failed.
   *
   * This is the field BOARD F-060 is about. Measured 2026-09-26 taking suite 07 (run 3): a turn spent
   * **955 s over five in-turn model calls**, and the same endpoint answered the same prompt in **3.1 s**
   * when called directly — so the turn's cost was neither the budget nor the work, and nothing recorded
   * which of the five calls held the time. A single number per call is what separates a slow provider from
   * slow work, and it is the only thing that can, because the product records no other latency.
   */
  latencyMs: number;
  /** 1 when the first attempt answered. Higher means the endpoint failed and was retried. */
  attempts: number;
}

export interface ChatCompletionResult extends ModelCallMeasurement {
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

export interface ChatCompletionWithToolsResult extends ModelCallMeasurement {
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
  /**
   * How long one attempt may take, from `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS`. Absent means no timeout is
   * applied and the endpoint's own behaviour is the only bound.
   *
   * Documented, defaulted and exported by `AppConfig` since before this field existed, and read by
   * **nothing**: an operator set a number that did nothing (BOARD F-061). A refusal that names a timeout
   * which was never applied is worse than no timeout at all, because it sends the operator to tune a
   * setting in the wrong place.
   */
  initialTimeoutMs?: number;
  /**
   * How many times a failed attempt is retried, after the first, from `KAMPAKU_MODEL_INITIAL_RETRIES`.
   * Absent or 0 means one attempt: the call either answers or it fails, and it does not spend the tokens
   * twice on a request the operator never sees fail.
   */
  initialRetries?: number;
}

/**
 * The endpoint's own word for its reasoning budget, passed through unchanged.
 *
 * Deliberately a string rather than an enum: an enum would claim a vocabulary the protocol does not have,
 * and would turn a word a future endpoint supports into a type error instead of a request.
 */
export type ReasoningEffort = string;
