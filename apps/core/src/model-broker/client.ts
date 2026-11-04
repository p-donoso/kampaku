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
import { ModelCallBudgetError, runWithCallBudget, type ModelCallPolicy } from "./call-budget.js";
import {
  assessProbeAnswer,
  ENDPOINT_PROBE_TOOL,
  endpointProbeMessages,
  type EndpointCapabilityRecord,
} from "./endpoint-capability.js";

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

  /**
   * How long one attempt may take, and how many attempts one call is allowed.
   *
   * Held on the broker for the same reason the reasoning effort is: a broker belongs to one role, and a
   * role that had to remember to pass its own timeout would eventually forget. The two settings are the
   * documented operator surface (`KAMPAKU_MODEL_INITIAL_TIMEOUT_MS`, `KAMPAKU_MODEL_INITIAL_RETRIES`) and
   * they were read nowhere until this policy existed — see `call-budget.ts` for the measurement.
   */
  private readonly callPolicy: Omit<ModelCallPolicy, "label">;

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
    this.callPolicy = {
      timeoutMs:
        options.initialTimeoutMs && options.initialTimeoutMs > 0 ? options.initialTimeoutMs : undefined,
      retries: Math.max(0, Math.floor(options.initialRetries ?? 0)),
    };
  }

  /**
   * The timeout and retry policy in force, as the operator configured it.
   *
   * Exposed for the same reason `effortInUse` is: a setting that changes behaviour has to be readable by
   * the code that reports what happened, so a run can be explained rather than guessed at.
   */
  callPolicyInUse(): Omit<ModelCallPolicy, "label"> {
    return this.callPolicy;
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
  private async send<T>(
    label: string,
    request: (options: { timeoutMs?: number }) => Promise<T>,
    /**
     * The turn's deadline, when this call belongs to one.
     *
     * Passed per call rather than held on the broker because a broker is per role and a deadline is per turn:
     * the same planner broker serves a turn with two minutes left and a turn with twenty. The call is allotted
     * the smaller of its own timeout and whatever remains, so the turn's bound bites **during** the call
     * instead of after it (BOARD F-070).
     */
    deadlineAt?: number,
  ): Promise<{ value: T; latencyMs: number; attempts: number }> {
    return runWithCallBudget(
      { ...this.callPolicy, label, deadlineAt },
      ({ timeoutMs }) => request({ timeoutMs }),
      (error) => this.isTerminalRefusal(error),
    );
  }

  /**
   * A refusal that a second identical attempt cannot fix.
   *
   * Two cases, both measured rather than hypothetical. A `reasoning_effort` rejection is the same request
   * being refused again, and retrying it silently would spend the tokens twice on a call the operator never
   * sees fail — which is the opposite of what that field is here for. A context overflow is refused before
   * the request is sent at all, so an attempt count on it would report retries that never happened.
   */
  private isTerminalRefusal(error: unknown): boolean {
    if (error instanceof ContextOverflowError) return true;
    if (!this.reasoningEffort) return false;
    const status = (error as { status?: number } | null)?.status;
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (status === 400 && /reasoning[_ ]effort/i.test(message)) {
      throw new Error(
        `The model endpoint rejected "reasoning_effort: ${this.reasoningEffort}". Kampaku asks for it on ` +
          "every call, so nothing will work against this endpoint until it is switched off: set " +
          "KAMPAKU_PLANNER_REASONING_EFFORT=off and KAMPAKU_AGENT_REASONING_EFFORT=off, then restart. " +
          "The endpoint said: " +
          message,
      );
    }
    return false;
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

  async chat(messages: ChatMessage[], options?: { deadlineAt?: number }): Promise<ChatCompletionResult> {
    this.assertFits(messages);
    const call = await this.send(
      "JSON completion",
      ({ timeoutMs }) =>
      this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          response_format: { type: "json_object" },
          ...this.effortField(),
        },
        { timeout: timeoutMs, maxRetries: 0 },
      ),
      options?.deadlineAt,
    );
    const response = call.value;

    const content = response.choices[0]?.message?.content ?? "";
    const inspected = this.inspectUsage(response.usage, messages, 0, "json completion");

    return {
      content,
      model: response.model,
      routedVia: "openai-compatible",
      latencyMs: call.latencyMs,
      attempts: call.attempts,
      ...inspected,
    };
  }

  async complete(messages: ChatMessage[], options?: { deadlineAt?: number }): Promise<ChatCompletionResult> {
    this.assertFits(messages);
    const call = await this.send(
      "text completion",
      ({ timeoutMs }) =>
      this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          ...this.effortField(),
        },
        { timeout: timeoutMs, maxRetries: 0 },
      ),
      options?.deadlineAt,
    );
    const response = call.value;

    const inspected = this.inspectUsage(
      response.usage,
      messages,
      0,
      "text completion",
    );

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model,
      latencyMs: call.latencyMs,
      attempts: call.attempts,
      ...inspected,
    };
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    options?: { deadlineAt?: number },
  ): Promise<ChatCompletionWithToolsResult> {
    // Tool schemas are part of the prompt the endpoint reads, and they are not small: the front
    // office's twelve schemas measured 8 220 characters. Counting them is the difference between
    // refusing a turn that overflows and refusing one that does not.
    const toolTokens = tools.length > 0 ? Math.ceil(JSON.stringify(tools).length / 3) : 0;
    this.assertFits(messages);
    const call = await this.send(
      "tool-calling completion",
      ({ timeoutMs }) =>
      this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools,
          tool_choice: "auto",
          ...this.effortField(),
        },
        { timeout: timeoutMs, maxRetries: 0 },
      ),
      options?.deadlineAt,
    );
    const response = call.value;

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
      latencyMs: call.latencyMs,
      attempts: call.attempts,
      ...inspected,
    };
  }

  /**
   * Asks the endpoint whether it will call a tool, once, and records the answer.
   *
   * The question is the only one that matters for a product whose replies are supposed to come from tool
   * results: an endpoint can advertise `tools` and answer in prose (BOARD F-008). It costs one small call per
   * process per endpoint+model — the caller caches it — and it is deliberately not retried: a refusal here is
   * information, and retrying it merely spends the tokens twice.
   *
   * A failed *request* returns `unavailable` with the endpoint's words rather than throwing, because a turn that
   * cannot reach the endpoint already reports that defect with its own message, and turning it into a capability
   * gap would send the operator to the wrong setting.
   */
  async probeToolCalling(deadlineAt?: number): Promise<EndpointCapabilityRecord> {
    const probedAt = new Date().toISOString();
    const base = { baseUrl: this.baseUrl, requestedModel: this.model, probedAt };
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: endpointProbeMessages() as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          tools: [ENDPOINT_PROBE_TOOL],
          tool_choice: "auto",
          // Small, not tiny: a reasoning model spends its first tokens thinking, and a 64-token ceiling measured
          // 2026-11-04 on `gpt-oss-120b` came back as prose cut off mid-thought ("So we call functions.e…"), which
          // the probe would have recorded as an endpoint that cannot call tools. The probe's answer must be about
          // the endpoint, not about its own budget.
          max_tokens: 512,
        },
        {
          timeout:
            deadlineAt === undefined
              ? this.callPolicy.timeoutMs
              : Math.min(this.callPolicy.timeoutMs ?? Number.MAX_SAFE_INTEGER, Math.max(1, deadlineAt - Date.now())),
          maxRetries: 0,
        },
      );
      const choice = response.choices[0]?.message;
      const assessed = assessProbeAnswer({
        content: choice?.content,
        toolCalls: (choice?.tool_calls ?? []).map((call) => ({ name: call.function.name })),
        model: response.model,
      });
      return { ...base, ...assessed, resolvedModel: assessed.resolvedModel ?? response.model };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ...base, toolCalls: "unavailable", detail: detail.slice(0, 240) };
    }
  }

  /** The endpoint the broker was built for, so a capability record can be keyed by it. */
  get baseUrl(): string | undefined {
    return this.client.baseURL;
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

export { ModelCallBudgetError };
