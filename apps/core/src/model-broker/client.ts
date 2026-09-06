import OpenAI from "openai";
import type { ChatCompletionResult, ChatCompletionWithToolsResult, ChatMessage, ModelBrokerOptions } from "./types.js";

export class ModelBroker {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: ModelBrokerOptions) {
    this.client = new OpenAI({
      baseURL: options.baseUrl,
      apiKey: options.apiKey ?? "local-dev",
      timeout: 120_000,
    });
    this.model = options.model;
  }

  async chat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "";

    return {
      content,
      model: response.model,
      routedVia: "freellmapi",
    };
  }

  async complete(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    });

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model,
    };
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<ChatCompletionWithToolsResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools,
      tool_choice: "auto",
    });

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
