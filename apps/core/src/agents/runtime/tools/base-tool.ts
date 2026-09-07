import type OpenAI from "openai";
import type { KampakuToolContext, AgentScope } from "./index.js";

/**
 * Result returned by a runtime tool execution.
 */
export interface ToolExecutionResult {
  /** The unique name of the executed tool. */
  toolName: string;
  /** Resulting data payload produced by the tool. */
  output: unknown;
}

/**
 * Handler function signature for tool execution.
 */
export type ToolHandler = (
  ctx: KampakuToolContext,
  args: Record<string, unknown>,
  scope?: AgentScope,
) => Promise<unknown> | unknown;

/**
 * Registered tool definition pairing OpenAI schema with execution handler.
 */
export interface RegisteredTool {
  /** OpenAI tool specification. */
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  /** Function handler executing the tool logic. */
  handler: ToolHandler;
}

/**
 * Abstract base class for model-agnostic runtime tools.
 */
export abstract class BaseTool {
  /** OpenAI function calling specification. */
  abstract readonly definition: OpenAI.Chat.Completions.ChatCompletionTool;

  /** Tool name identifier. */
  get name(): string {
    return this.definition.function.name;
  }

  /** Descriptive summary of the tool function. */
  get description(): string | undefined {
    return this.definition.function.description;
  }

  /**
   * Executes the tool within the provided context and parameters.
   * @param ctx - Runtime dependencies and stores.
   * @param args - Tool invocation arguments.
   * @param scope - Optional agent security scope.
   */
  abstract execute(
    ctx: KampakuToolContext,
    args: Record<string, unknown>,
    scope?: AgentScope,
  ): Promise<unknown> | unknown;
}
