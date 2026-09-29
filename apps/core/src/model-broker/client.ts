import OpenAI from "openai";
import type {
  ChatCompletionResult,
  ChatCompletionWithToolsResult,
  ChatMessage,
  ModelBrokerOptions,
  ReasoningEffort,
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

  /**
   * The reasoning budget asked for on every call from this broker, or `undefined` for none.
   *
   * Held rather than passed per call because a broker belongs to one role: the planner's broker plans and
   * the front office's broker works. A role that had to remember to pass its own effort would eventually
   * forget, and the omission would be invisible — the call would simply cost more.
   */
  private readonly reasoningEffort?: ReasoningEffort;

  constructor(options: ModelBrokerOptions) {
    // No implicit host. This used to fall back to `http://localhost:3001/v1`, which turned a missing
    // setting into a silent connection attempt against a port the operator never named — so the failure
    // surfaced as a timeout somewhere else, naming nothing. A missing base URL is a configuration
    // mistake and it is reported as one, here, where the model is actually needed: `stub` mode never
    // reaches this constructor, so an instance that needs no endpoint does not have to have one.
    if (!options.baseUrl?.trim()) {
      throw new Error(
        "No model endpoint is configured, so no model call can be made. Set " +
          "KAMPAKU_MODEL_BASE_URL to an OpenAI-compatible base URL ending in /v1, and " +
          "KAMPAKU_MODEL_API_KEY if that endpoint needs a key. To run without a model, set " +
          "KAMPAKU_AGENT=stub.",
      );
    }
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: options.apiKey ?? "local-dev",
    });
    this.model = options.model;
    this.configuredContextTokens =
      options.contextTokens && options.contextTokens > 0 ? options.contextTokens : undefined;
    this.replyReserveTokens = options.replyReserveTokens ?? DEFAULT_REPLY_RESERVE_TOKENS;
    this.reasoningEffort = options.reasoningEffort?.trim() || undefined;
  }

  /** The reasoning budget this broker asks for, or `undefined` when it asks for none. */
  effortInUse(): ReasoningEffort | undefined {
    return this.reasoningEffort;
  }

  /**
   * The reasoning budget as a request field, or an empty object when there is none.
   *
   * The cast is the honest part: `reasoning_effort` is in the OpenAI specification for reasoning models and
   * absent from the SDK's request type for the chat-completions route this broker uses, so the field is
   * added to a request the type system does not describe. Asserting it here, once, keeps every call site
   * reading as a normal request.
   */
  private effortField(): Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> {
    return this.reasoningEffort
      ? ({ reasoning_effort: this.reasoningEffort } as Partial<
          OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
        >)
      : {};
  }

  /**
   * Sends one request, and makes the endpoint's refusal of the reasoning budget actionable.
   *
   * A refusal is a real possibility, because the parameter is not universal: an endpoint that serves only
   * non-reasoning models rejects the whole request with a 400 when it sees the field. Failing that way with
   * the endpoint's own words would leave an operator holding a product that stopped working and a setting
   * they cannot connect to it, so the refusal is re-stated with the two settings named and the way to switch
   * the behaviour off. Two conditions, both required — a 400 *and* a message naming the parameter — because a
   * looser match would relabel somebody else's malformed request as this problem.
   *
   * The parameter is deliberately **not** retried without: a silent second attempt would spend the tokens
   * twice on a call the operator never sees fail, which is the opposite of what this field is here for.
   */
  private async send<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (!this.reasoningEffort) throw error;
      const status = (error as { status?: number } | null)?.status;
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (status !== 400 || !/reasoning[_ ]effort/i.test(message)) throw error;
      throw new Error(
        `The model endpoint rejected "reasoning_effort: ${this.reasoningEffort}". Kampaku asks for it on ` +
          "every call, so nothing will work against this endpoint until it is switched off: set " +
          "KAMPAKU_PLANNER_REASONING_EFFORT=off and KAMPAKU_AGENT_REASONING_EFFORT=off, then restart. " +
          "The endpoint said: " +
          message,
      );
    }
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
    const response = await this.send(() =>
      this.client.chat.completions.create({
        model: this.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        response_format: { type: "json_object" },
        ...this.effortField(),
      }),
    );

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
    const response = await this.send(() =>
      this.client.chat.completions.create({
        model: this.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        ...this.effortField(),
      }),
    );

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
    const response = await this.send(() =>
      this.client.chat.completions.create({
        model: this.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools,
        tool_choice: "auto",
        ...this.effortField(),
      }),
    );

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
