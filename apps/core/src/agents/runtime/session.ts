import type { AppConfig } from "../../config.js";
import { loadKampakuDefinition } from "../definitions.js";
import type { AgentChatRequest, AgentChatResponse, RunKampakuChatOptions } from "../types.js";
import { createModelBroker } from "../../model-broker/client.js";
import { formatKampakuProviderError } from "../../model-broker/freellmapi-errors.js";
import { ContextOverflowError, type ContextTruncation } from "../../model-broker/context-limit.js";
import type { ChatMessage } from "../../model-broker/types.js";
import { ConversationStoreError } from "../../persistence/conversation-store.js";
import { parsePendingQuestion } from "./pending-question.js";
import {
  auditTurnClaims,
  snapshotDurableState,
  type ClaimAuditContext,
  type ClaimFinding,
  type DurableSnapshot,
} from "./claim-audit.js";
import { renderDurableState, snapshotForPrompt } from "./durable-state.js";
import {
  appendSummaryToSystemPrompt,
  buildHistoryContext,
  maybeCompactConversation,
} from "./compact-history.js";
import type { ChatProgressCallback } from "./progress.js";
import {
  buildStubSystemPrompt,
  isListAgentsRequest,
  parseSubAgentRequest,
} from "./stub-agent.js";
import { getToolLabel } from "./tool-labels.js";
import {
  boundToolResult,
  clearStaleToolResults,
  duplicateCallNotice,
  TurnToolCalls,
} from "./turn-budget.js";
import {
  executeToolCall,
  type ToolRuntimeScope,
  KAMPAKU_TOOLS,
  type KampakuToolContext,
} from "./tools/index.js";
import { prependGlobalSystemPrompt } from "../../application/settings/global-system-prompt.js";
import { resolveModelProviderSettings } from "../../application/settings/model-provider.js";

const MAX_TOOL_ITERATIONS = 10;

export class KampakuChatError extends Error {
  constructor(
    message: string,
    readonly code: "PROVIDER_UNAVAILABLE" | "BROKER_ERROR" | "CONVERSATION_NOT_FOUND",
  ) {
    super(message);
    this.name = "KampakuChatError";
  }
}

function resolveConversation(ctx: KampakuToolContext, request: AgentChatRequest) {
  if (request.conversationId) {
    try {
      return ctx.conversationStore.requireConversation(request.conversationId);
    } catch (error) {
      if (error instanceof ConversationStoreError && error.code === "NOT_FOUND") {
        throw new KampakuChatError(error.message, "CONVERSATION_NOT_FOUND");
      }
      throw error;
    }
  }

  return ctx.conversationStore.createConversation({
    agentSlug: "kampaku",
    projectId: request.projectId,
  });
}

async function persistChatTurn(
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  userMessage: string,
  response: AgentChatResponse,
  loopMessages: ChatMessage[],
  onProgress?: ChatProgressCallback,
): Promise<AgentChatResponse> {
  onProgress?.({ phase: "composing" });
  ctx.conversationStore.setTitleIfEmpty(conversationId, userMessage);
  ctx.conversationStore.appendMessage(conversationId, { role: "user", content: userMessage });
  if (loopMessages.length > 0) {
    ctx.conversationStore.appendMessages(conversationId, loopMessages);
  }
  ctx.conversationStore.appendMessage(conversationId, {
    role: "assistant",
    content: response.reply,
  });

  persistEmperorQuestion(ctx, conversationId, response.reply);

  await maybeCompactConversation(ctx, config, conversationId);

  return { ...response, conversationId };
}

/**
 * Turns a `<kampaku-question>` block into a durable pending question.
 *
 * The tag is the documented way the root agent asks the emperor for a decision, but it
 * used to be rendered by the web client and stored nowhere, so a required question was
 * invisible to `questions list` and `GET /api/v1/questions` (LangProbe G-01). Persisting
 * it here makes the human gate answerable from the CLI and the UI.
 *
 * A failure to record the gate must never take down the reply that carries it.
 */
function persistEmperorQuestion(
  ctx: KampakuToolContext,
  conversationId: string,
  reply: string,
): void {
  const pending = parsePendingQuestion(reply);
  if (!pending?.required) return;
  if (!ctx.questionStore) return;

  try {
    const conversation = ctx.conversationStore.requireConversation(conversationId);
    ctx.questionStore.askEmperor({
      askedByAgentId: conversation.agentSlug,
      question: pending.raw,
      questionId: pending.id,
      projectId: conversation.projectId ?? undefined,
    });
  } catch (error) {
    console.error(
      `[chat] could not record pending question "${pending.id}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function runToolWithProgress(
  ctx: KampakuToolContext,
  toolName: string,
  args: string,
  onProgress?: ChatProgressCallback,
  meta?: ToolRuntimeScope,
) {
  onProgress?.({ phase: "tool", tool: toolName, label: getToolLabel(toolName) });
  return executeToolCall(ctx, toolName, args, meta);
}

export async function runKampakuChat(
  ctx: KampakuToolContext,
  config: AppConfig,
  request: AgentChatRequest | string,
  options: RunKampakuChatOptions = {},
): Promise<AgentChatResponse> {
  const chatRequest = typeof request === "string" ? { message: request } : request;
  const message = chatRequest.message.trim();
  const conversation = resolveConversation(ctx, chatRequest);
  const { onProgress } = options;

  onProgress?.({ phase: "thinking" });

  if (config.agentMode === "stub") {
    return runStubChat(ctx, config, conversation.id, message, onProgress);
  }

  return runLlmChat(ctx, config, conversation.id, message, onProgress);
}

async function runStubChat(
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  message: string,
  onProgress?: ChatProgressCallback,
): Promise<AgentChatResponse> {
  if (isListAgentsRequest(message)) {
    const output = await runToolWithProgress(ctx, "list_agents", "{}", onProgress);
    const { agents, tree } = output.output as {
      agents: Array<{ slug: string; name: string; source: string }>;
      tree: string[];
    };
    const lines = agents.map((agent) => `- ${agent.slug} (${agent.source}): ${agent.name}`);
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: `Registered agents:\n${lines.join("\n")}\n\nTree:\n${tree.join("\n")}`,
      toolsUsed: ["list_agents"],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  const parsed = parseSubAgentRequest(message);
  if (parsed) {
    const result = await runToolWithProgress(
      ctx,
      "create_sub_agent",
      JSON.stringify({
        slug: parsed.slug,
        name: parsed.name,
        responsibilities: parsed.responsibilities,
        system_prompt: buildStubSystemPrompt(parsed.name, parsed.responsibilities),
      }),
      onProgress,
      { agentId: ctx.agentStore.getKampakuAgent().id, conversationId },
    );
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: `Created sub-agent ${parsed.slug} and made it available for delegated work.`,
      toolsUsed: [result.toolName],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  const lower = message.toLowerCase();
  if (
    lower.includes("proyecto") ||
    lower.includes("project") ||
    lower.includes("roadmap") ||
    lower.includes("tarea") ||
    lower.includes("task") ||
    lower.includes("sprint") ||
    lower.includes("deleg")
  ) {
    return persistChatTurn(ctx, config, conversationId, message, {
      reply: "Kampaku can clarify this intent, appoint a responsible project lead, and delegate durable planning and execution through that lead.",
      toolsUsed: [],
      agentUsed: "stub",
      conversationId,
    }, [], onProgress);
  }

  return persistChatTurn(ctx, config, conversationId, message, {
    reply:
      "Got it. I can clarify intent, delegate work through responsible agents, and report verified durable outcomes.",
    agentUsed: "stub",
    conversationId,
  }, [], onProgress);
}

async function runLlmChat(
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  message: string,
  onProgress?: ChatProgressCallback,
): Promise<AgentChatResponse> {
  const provider = resolveModelProviderSettings(ctx.store, config);
  const broker = createModelBroker(provider);
  // Tracked across the whole turn, because a later iteration can be the one that overflows while an
  // earlier one fit. Reported once, on the reply, so the operator sees the turn was not fully read.
  let truncation: ContextTruncation | undefined;

  const definition = loadKampakuDefinition();
  const agent = ctx.agentStore.getKampakuAgent();
  const orchestratorTools = KAMPAKU_TOOLS.filter((tool) => definition.tools.includes(tool.function.name));
  const { summary, messages: history } = buildHistoryContext(ctx.conversationStore, conversationId);
  // The orchestrator carries the operator skills and nothing else. It used to also carry
  // `buildDefaultSkillsPrompt()` — the eleven `workflow-*` fragments, which instruct the reader to call
  // `execute_work_item`, `report_blocker`, `recall`, `propose_wiki_edit` and similar tools that the
  // front office does not hold. See `buildOrchestratorSkillsPrompt` for the measurement.
  const systemPrompt = appendSummaryToSystemPrompt(
    prependGlobalSystemPrompt(
      ctx.store,
      `${definition.systemPrompt}${ctx.skillStore.buildOrchestratorSkillsPrompt()}`,
    ),
    summary,
  );
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    // Ground truth is injected immediately before the turn, AFTER the history, so a stale claim the
    // model made in an earlier reply cannot outrank the current stores. The block states that
    // precedence explicitly. See durable-state.ts for the failure this addresses.
    { role: "system", content: renderDurableState(snapshotForPrompt(ctx)) },
    { role: "user", content: message },
  ];

  const loopMessages: ChatMessage[] = [];
  const toolsUsed: string[] = [];
  // One per user turn. A repeat call inside a turn is not new information, and re-sending an identical
  // result costs its full size for nothing: measured, `list_agents` was called twice with identical
  // arguments for 2 725 duplicated characters. See turn-budget.ts.
  const turnCalls = new TurnToolCalls();
  let model: string | undefined;
  // Durable state is captured around the turn so the reply can be reconciled against what actually
  // changed. A turn with zero tool calls cannot have created anything, whatever its reply says.
  const stateBefore = snapshotDurableState(claimAuditContext(ctx));

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    // The cheapest context lever, applied before every model call: older re-fetchable tool results lose
    // their payload and keep their record. Deterministic, no model call, and reversible by asking again.
    // The strongest published evidence for this over summarization is JetBrains' SWE-bench result — see
    // turn-budget.ts.
    const pruning = clearStaleToolResults(messages);
    if (pruning.cleared > 0) {
      onProgress?.({ phase: "pruning", cleared: pruning.cleared, tokensSaved: pruning.tokensSaved });
    }
    let response;
    try {
      response = await broker.chatWithTools(messages, orchestratorTools);
    } catch (error) {
      // A turn that cannot fit is not a provider failure: the endpoint is reachable and the limit was
      // measured. Reporting it as "failed to contact the provider" would send the operator to check a
      // healthy endpoint. Answer the turn with the reason, and leave the conversation usable.
      if (error instanceof ContextOverflowError) {
        return persistChatTurn(ctx, config, conversationId, message, {
          reply: error.message,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
          agentUsed: "llm",
          model,
          conversationId,
        }, loopMessages, onProgress);
      }
      const detail = error instanceof Error ? error.message : String(error);
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: formatKampakuProviderError(detail),
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        agentUsed: "llm",
        model,
        conversationId,
      }, loopMessages, onProgress);
    }

    truncation = response.truncated ?? truncation;
    model = response.model;
    const choice = response.choices[0];
    if (!choice) {
      return persistChatTurn(ctx, config, conversationId, message, {
        reply: "No response from model.",
        toolsUsed,
        agentUsed: "llm",
        model,
        conversationId,
      }, loopMessages, onProgress);
    }

    const assistantMessage = choice.message;
    if (assistantMessage.tool_calls?.length) {
      const assistantChatMessage = {
        role: "assistant" as const,
        content: assistantMessage.content ?? "",
        tool_calls: assistantMessage.tool_calls,
      };
      messages.push(assistantChatMessage);
      loopMessages.push(assistantChatMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        toolsUsed.push(toolName);
        let toolContent: string;
        if (turnCalls.isRepeat(toolName, toolCall.function.arguments)) {
          // Withheld, not re-executed: the result is already in this turn and re-running it would cost
          // the work again to say the same thing.
          toolContent = duplicateCallNotice(toolName);
        } else {
          try {
            onProgress?.({ phase: "tool", tool: toolName, label: getToolLabel(toolName) });
            const result = await executeToolCall(ctx, toolName, toolCall.function.arguments, {
              agentId: agent.id,
              conversationId,
              projectId: ctx.conversationStore.requireConversation(conversationId).projectId ?? undefined,
            });
            toolContent = boundToolResult(JSON.stringify({ ok: true, output: result.output }));
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            toolContent = JSON.stringify({ ok: false, error: detail });
          }
        }
        const toolChatMessage = {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: toolContent,
        };
        messages.push(toolChatMessage);
        loopMessages.push(toolChatMessage);
      }
      continue;
    }

    const reply = assistantMessage.content?.trim() || "No response.";
    return persistChatTurn(ctx, config, conversationId, message, {
      reply,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
      unverifiedClaims: auditReply(ctx, reply, stateBefore, toolsUsed),
      contextTruncation: truncation,
      agentUsed: "llm",
      model,
      conversationId,
    }, loopMessages, onProgress);
  }

  onProgress?.({ phase: "composing" });
  const synthesized = await synthesizeFinalReply(broker, messages, toolsUsed);
  return persistChatTurn(ctx, config, conversationId, message, {
    reply: synthesized.reply,
    toolsUsed,
    unverifiedClaims: auditReply(ctx, synthesized.reply, stateBefore, toolsUsed),
    contextTruncation: synthesized.truncated ?? truncation,
    agentUsed: "llm",
    model,
    conversationId,
  }, loopMessages, onProgress);
}

/**
 * Builds the claim-audit view over the durable stores, and runs one audit.
 */
function claimAuditContext(ctx: KampakuToolContext): ClaimAuditContext {
  return {
    listProjectSlugs: () => ctx.store.listProjects().map((project) => project.slug),
    listGeneratedAgentSlugs: () => ctx.agentStore.listGeneratedAgents().map((a) => a.slug),
    listProjectRepositoryUrls: () =>
      ctx.store
        .listProjects()
        .flatMap((project) => project.repositories.map((repo) => repo.url))
        .filter((url) => url.startsWith("file://")),
    countWorkItems: () => ctx.pmStore.listAllWorkItems().length,
  };
}

function auditReply(
  ctx: KampakuToolContext,
  reply: string,
  before: DurableSnapshot,
  toolsUsed: string[],
): ClaimFinding[] | undefined {
  try {
    const after = snapshotDurableState(claimAuditContext(ctx));
    const findings = auditTurnClaims({ reply, before, after, toolsUsed });
    return findings.length > 0 ? findings : undefined;
  } catch {
    // An audit failure must never take down the reply it was auditing.
    return undefined;
  }
}

async function synthesizeFinalReply(
  broker: ReturnType<typeof createModelBroker>,
  messages: ChatMessage[],
  toolsUsed: string[],
): Promise<{ reply: string; truncated?: ContextTruncation }> {
  messages.push({
    role: "user",
    content:
      "Summarize what you accomplished for the emperor based on the tool results above. Reply in plain text only; do not call any more tools.",
  });

  try {
    const response = await broker.complete(messages);
    const reply = response.content.trim();
    if (reply) {
      return { reply, truncated: response.truncated };
    }
  } catch {
    // Fall through to a deterministic summary. A turn that cannot fit still has to answer.
  }

  const uniqueTools = [...new Set(toolsUsed)];
  return {
    reply: `Finished ${uniqueTools.length} tool step(s): ${uniqueTools.join(", ")}.`,
  };
}

export type { KampakuToolContext };
