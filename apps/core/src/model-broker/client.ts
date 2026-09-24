import OpenAI from "openai";
import type {
  ChatCompletionResult,
  ChatCompletionWithToolsResult,
  ChatMessage,
  ModelBrokerOptions,
} from "./types.js";
import {
  ContextOverflowError,
  DEFAULT_REPLY_RESERVE_TOKENS,
  estimateMessagesTokens,
  looksTruncated,
  type ContextTruncation,
} from "./context-limit.js";

/**
 * The model plane.
 *
 * Two things it now does beyond sending a request. Both exist because five eval runs were measured
 * through a silently truncated turn and nothing reported it — see `context-limit.ts` for the
 * measurement.
 */
export class ModelBroker {
  private readonly client: OpenAI;

  private readonly model: string;

  /** The endpoint's effective context, from configuration. */
  private configuredContextTokens?: number;

  /**
   * A limit measured from a truncated turn on this endpoint.
   *
   * The reported count on a truncated turn is approximately the endpoint's cap, so the first truncation
   * teaches the process what the next turn can afford. Self-correcting, and it needs no configuration
   * and no vendor-specific API: `usage.prompt_tokens` is part of the documented contract.
   */
  private learnedContextTokens?: number;

  private readonly replyReserveTokens: number;

  constructor(options: ModelBrokerOptions) {
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: options.apiKey ?? "local-dev",
    });
    this.model = options.model;
    this.configuredContextTokens =
      options.contextTokens && options.contextTokens > 0 ? options.contextTokens : undefined;
    this.replyReserveTokens = options.replyReserveTokens ?? DEFAULT_REPLY_RESERVE_TOKENS;
  }

  /** The limit this process will enforce, or `null` when nothing is known yet. */
  effectiveContextTokens(): number | null {
    return this.configuredContextTokens ?? this.learnedContextTokens ?? null;
  }

  /**
   * Refuses a turn that cannot fit, instead of sending one that will be cut.
   *
   * Only runs when a limit is known. An unknown limit is not a reason to guess: the post-flight check
   * catches the truncation anyway, and a wrong refusal would be its own defect.
   */
  private assertFits(messages: ChatMessage[]): void {
    const limit = this.effectiveContextTokens();
    if (!limit) return;
    const needed = estimateMessagesTokens(messages) + this.replyReserveTokens;
    if (needed <= limit) return;
    throw new ContextOverflowError(
      needed,
      limit,
      this.configuredContextTokens ? "configured" : "learned",
    );
  }

  /**
   * Reads the endpoint's view of the prompt and reports a cut.
   *
   * `estimated` is deliberately the same loose estimate used for the pre-flight, and the comparison is
   * deliberately generous: a turn is only called truncated when the endpoint reports reading well under
   * half of what it was sent.
   */
  private inspectUsage(
    usage: { prompt_tokens?: number } | null | undefined,
    messages: ChatMessage[],
    toolTokens: number,
    note: string,
  ): { promptTokens?: number; truncated?: ContextTruncation } {
    const reportedTokens = usage?.prompt_tokens;
    if (typeof reportedTokens !== "number" || reportedTokens <= 0) return {};

    const estimatedTokens = estimateMessagesTokens(messages) + toolTokens;
    const promptTokens = reportedTokens;

    if (!looksTruncated({ reportedTokens, estimatedTokens })) {
      return { promptTokens };
    }

    // Learn the cap so the next turn is refused before it is sent. The reported count is what the
    // endpoint actually read, which is its window minus what it holds back for the reply.
    if (!this.learnedContextTokens || reportedTokens < this.learnedContextTokens) {
      this.learnedContextTokens = reportedTokens + this.replyReserveTokens;
    }

    return {
      promptTokens,
      truncated: { reportedTokens, estimatedTokens, note },
    };
  }

  async chat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    this.assertFits(messages);
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "";
    const inspected = this.inspectUsage(response.usage, messages, 0, "json completion");

    return {
      content,
      model: response.model,
      routedVia: "openai-compatible",
      ...inspected,
    };
  }

  async complete(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    this.assertFits(messages);
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    });

    const inspected = this.inspectUsage(
      response.usage,
      messages,
      0,
      "text completion",
    );

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model,
      ...inspected,
    };
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<ChatCompletionWithToolsResult> {
    // Tool schemas are part of the prompt the endpoint reads, and they are not small: the front
    // office's twelve schemas measured 8 220 characters. Counting them is the difference between
    // refusing a turn that overflows and refusing one that does not.
    const toolTokens = tools.length > 0 ? Math.ceil(JSON.stringify(tools).length / 3) : 0;
    this.assertFits(messages);
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools,
      tool_choice: "auto",
    });

    const inspected = this.inspectUsage(response.usage, messages, toolTokens, "tool call");

    return {
      choices: response.choices.map((choice) => ({
        message: {
          content: choice.message.content,
          tool_calls: choice.message.tool_calls?.map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          })),
        },
      })),
      model: response.model,
      ...inspected,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const base = this.client.baseURL.replace(/\/v1\/?$/, "");
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export function createModelBroker(options: ModelBrokerOptions): ModelBroker {
  return new ModelBroker(options);
}
