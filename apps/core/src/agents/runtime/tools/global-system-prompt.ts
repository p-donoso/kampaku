import type OpenAI from "openai";
import {
  getGlobalSystemPromptSettings,
  saveGlobalSystemPromptSettings,
} from "../../../application/settings/global-system-prompt.js";
import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";

const SKILL_SLUG = "system-global-prompt-admin";

function assertKampaku(ctx: KampakuToolContext, scope: ToolRuntimeScope | undefined): void {
  const agent = scope ? ctx.agentStore.getAgentBySlugOrId(scope.agentId) : undefined;
  if (agent?.slug !== "kampaku") throw new Error("Only Kampaku may manage the global system prompt.");
  if (!ctx.skillStore.getSkill(SKILL_SLUG)) throw new Error(`Required skill "${SKILL_SLUG}" is unavailable.`);
}

export const GET_GLOBAL_SYSTEM_PROMPT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_global_system_prompt",
    description: "Read the system prompt prepended to every Kampaku agent prompt. Kampaku only.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
};

export const UPDATE_GLOBAL_SYSTEM_PROMPT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "update_global_system_prompt",
    description: "Replace the system prompt prepended to every Kampaku agent prompt. Kampaku only.",
    parameters: {
      type: "object",
      properties: { prompt: { type: "string", description: "Complete replacement prompt." } },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
};

export function executeGetGlobalSystemPrompt(ctx: KampakuToolContext, scope?: ToolRuntimeScope) {
  assertKampaku(ctx, scope);
  return getGlobalSystemPromptSettings(ctx.store);
}

export function executeUpdateGlobalSystemPrompt(
  ctx: KampakuToolContext,
  scope: ToolRuntimeScope | undefined,
  args: { prompt: string },
) {
  assertKampaku(ctx, scope);
  return saveGlobalSystemPromptSettings(ctx.store, args.prompt);
}
