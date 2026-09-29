import type OpenAI from "openai";
import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";

/**
 * Result returned by a runtime tool execution.
 */
export interface ToolExecutionResult {
  /** The unique name of the executed tool. */
  toolName: string;
  /** Resulting data payload produced by the tool. */
  output: unknown;
  /**
   * What this call cost inside the turn, when the tool started a session of its own.
   *
   * A tool that delegates work spends the turn's clock and its model budget, and the turn's own counters
   * cannot see either: measured 2026-09-28 taking suite 07 (run 16), a 60-minute turn reported *"1 model
   * calls and 1 tool calls"* while the session it delegated to made **5 model calls and 17 tool calls** —
   * the stop under-reported the work by 4× on model calls and 17× on tool calls (BOARD F-060). Reported back
   * through the result rather than through shared mutable state, so the count a reply states is one the turn
   * actually received.
   */
  usage?: { modelCalls?: number; elapsedMs?: number };
}

/**
 * Handler function signature for tool execution.
 */
export type ToolHandler = (
  ctx: KampakuToolContext,
  args: Record<string, unknown>,
  scope?: ToolRuntimeScope,
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
    scope?: ToolRuntimeScope,
  ): Promise<unknown> | unknown;
}
