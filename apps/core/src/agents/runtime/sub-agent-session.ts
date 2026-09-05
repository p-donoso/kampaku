import type { AppConfig } from "../../config.js";
import { createModelBroker } from "../../model-broker/client.js";
import type { ChatMessage } from "../../model-broker/types.js";
import type { AgentRecord } from "../types.js";
import { prependGlobalSystemPrompt } from "../../application/settings/global-system-prompt.js";
import { resolveModelProviderSettings } from "../../application/settings/model-provider.js";
import { executeResolveBlocker } from "./tools/handle-blocker.js";
import {
  executeToolCall,
  KAMPAKU_TOOLS,
  type KampakuToolContext,
} from "./tools/index.js";

const MAX_TOOL_ITERATIONS = 10;

export interface SubAgentSessionResult {
  reply: string;
  toolsUsed: string[];
  model?: string;
}

function extractBlockerId(objective: string): string | undefined {
  const match = objective.match(/blocker_id:\s*([0-9a-f-]+)/i);
  return match?.[1];
}

async function runStubSubAgentSession(
  ctx: KampakuToolContext,
  agent: AgentRecord,
  objective: string,
): Promise<SubAgentSessionResult> {
  const blockerId = extractBlockerId(objective);
  if (blockerId && ctx.blockageStore) {
    const blocker = ctx.blockageStore.get(blockerId);
    if (blocker?.status === "pending" && blocker.recipientAgentId === agent.id) {
      executeResolveBlocker(ctx, {
        blocker_id: blockerId,
        agent_slug: agent.slug,
        resolution:
          "Review the failure context, narrow scope if needed, and retry the blocked task with clearer acceptance criteria.",
      });
      return {
        reply: `Blocker ${blockerId} resolved with retry instructions.`,
        toolsUsed: ["resolve_blocker"],
      };
    }
  }

  return {
    reply: "Stub sub-agent session completed without blocker actions.",
    toolsUsed: [],
  };
}

export async function runSubAgentSession(
  ctx: KampakuToolContext,
  agent: AgentRecord,
  objective: string,
  projectId?: string,
): Promise<SubAgentSessionResult> {
  if (ctx.config.agentMode === "stub") {
    return runStubSubAgentSession(ctx, agent, objective);
  }

  const provider = resolveModelProviderSettings(ctx.store, ctx.config);
  const broker = createModelBroker(provider);
  const tools = filterToolsForAgent(ctx.skillStore, agent.id);
  if (tools.length === 0) {
    throw new Error(`Agent "${agent.slug}" has no executable tools for autonomous sessions.`);
  }

  const systemPrompt = prependGlobalSystemPrompt(
    ctx.store,
    `${agent.systemPrompt}${ctx.skillStore.buildSkillPromptAppendix(agent.id)}`,
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: objective },
  ];

  const toolsUsed: string[] = [];
  let model: string | undefined;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await broker.chatWithTools(messages, tools);
    model = response.model;
    const choice = response.choices[0];
    if (!choice) break;

    const assistantMessage = choice.message;
    if (assistantMessage.tool_calls?.length) {
      const assistantChatMessage = {
        role: "assistant" as const,
        content: assistantMessage.content ?? "",
        tool_calls: assistantMessage.tool_calls,
      };
      messages.push(assistantChatMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        toolsUsed.push(toolName);
        let toolContent: string;
        try {
          const result = await executeToolCall(ctx, toolName, toolCall.function.arguments, {
            agentId: agent.id,
            projectId,
          });
          toolContent = JSON.stringify({ ok: true, output: result.output });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          toolContent = JSON.stringify({ ok: false, error: detail });
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolContent,
        });
      }
      continue;
    }

    const reply = assistantMessage.content?.trim() || "No response.";
    return { reply, toolsUsed, model };
  }

  return {
    reply: `Finished ${toolsUsed.length} tool step(s): ${[...new Set(toolsUsed)].join(", ") || "none"}.`,
    toolsUsed,
    model,
  };
}

function filterToolsForAgent(
  skillStore: KampakuToolContext["skillStore"],
  agentId: string,
): typeof KAMPAKU_TOOLS {
  const allowed = new Set(skillStore.getAgentToolNames(agentId));
  return KAMPAKU_TOOLS.filter((tool) => allowed.has(tool.function.name));
}
