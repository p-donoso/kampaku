import type { AppConfig } from "../../config.js";
import { createModelBroker } from "../../model-broker/client.js";
import type { ChatMessage } from "../../model-broker/types.js";
import type { AgentRecord } from "../types.js";
import { prependGlobalSystemPrompt } from "../../application/settings/global-system-prompt.js";
import { resolveModelProviderSettings } from "../../application/settings/model-provider.js";
import { renderDurableState, snapshotForPrompt } from "./durable-state.js";
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
  /**
   * Set when the session stopped because the **turn's** clock ran out, not because it finished.
   *
   * The caller (the front office, through `delegate_to_agent`) reads this and tells the emperor, so an
   * exhausted delegation surfaces as an exhausted turn rather than as a plausible summary of work nobody
   * did. Same name and same meaning as `AgentChatResponse.budgetExhausted`.
   */
  budgetExhausted?: { modelCalls: number; elapsedMs: number; budgetMs: number; deadlineAt: number };
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
  /** The deadline of the turn that started this session. Absent means a session with its own clock. */
  deadlineAt?: number,
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
  const grantedToolNames = new Set(tools.map((tool) => tool.function.name));

  const systemPrompt = prependGlobalSystemPrompt(
    ctx.store,
    `${agent.systemPrompt}${ctx.skillStore.buildSkillPromptAppendix(agent.id)}`,
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    // The same durable-state block the front office gets, and for the same reason measured at the front
    // office: an agent asked to act on a project has to be able to read what that project is and what is
    // already waiting on it.
    //
    // Measured 2026-09-25 in the suite-05 run, where this block was absent from every sub-agent session: a
    // project lead asked the emperor *"How should I explore the repository at file:///tmp/intent-demo?"*,
    // could not see that it was still open, and asked again four minutes later — *"Still waiting for
    // guidance on repository exploration approach."* — with a fresh id, because `ask_superior` mints
    // `async-${Date.now()}`. One decision, two gates, and the count the operator reads as a measure of how
    // much is blocked counted it twice (BOARD F-049).
    { role: "system", content: renderDurableState(snapshotForPrompt(ctx, projectId)) },
    { role: "user", content: objective },
  ];

  const toolsUsed: string[] = [];
  let model: string | undefined;
  const sessionStartedAt = Date.now();
  const effectiveDeadlineAt = deadlineAt ?? sessionStartedAt + ctx.config.turnBudgetMs;
  let modelCalls = 0;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    // The turn's budget, checked **before** paying for another call. When it trips, the session says so in
    // its own reply: an autonomous agent that stops silently reads to the front office as one that
    // finished, and the front office would then report work nobody did. This is the shape that produced a
    // 40-minute turn returning no reply at all (BOARD F-048).
    if (Date.now() >= effectiveDeadlineAt) {
      return {
        reply:
          `Stopped at the turn's time budget after ${modelCalls} model calls; no conclusion was reached and ` +
          "no work is reported as done. Report this to the emperor as a budget stop, not as a result.",
        toolsUsed,
        model,
        budgetExhausted: {
          modelCalls,
          elapsedMs: Date.now() - sessionStartedAt,
          budgetMs: ctx.config.turnBudgetMs,
          deadlineAt: effectiveDeadlineAt,
        },
      };
    }

    modelCalls += 1;
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
          const result = await executeToolCall(
            ctx,
            toolName,
            toolCall.function.arguments,
            {
              agentId: agent.id,
              projectId,
              // Handed down so a nested session spends the same budget rather than starting a fresh clock.
              deadlineAt: effectiveDeadlineAt,
            },
            // The grant is the tool set the agent's skills provide — the same set advertised above, now
            // enforced at dispatch. Same rule as the front office's: a toolset that is only advertised is
            // not a grant (`ToolNotGrantedError`).
            { allowed: grantedToolNames, label: `agent "${agent.slug}"'s skill-granted toolset` },
          );
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
