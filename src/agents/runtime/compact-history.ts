import type { AppConfig } from "../../config.js";
import { createModelBroker } from "../../model-broker/client.js";
import type { ModelBroker } from "../../model-broker/client.js";
import type { ChatMessage } from "../../model-broker/types.js";
import {
  COMPACTION_THRESHOLD,
  ConversationStore,
  KEEP_RECENT_MESSAGES,
  type StoredChatMessage,
} from "../../persistence/conversation-store.js";
import type { KampakuToolContext } from "./tools/index.js";
import { resolveModelProviderSettings } from "../../application/settings/model-provider.js";

export { COMPACTION_THRESHOLD, KEEP_RECENT_MESSAGES };

export interface CompactHistoryOptions {
  threshold?: number;
  keepRecent?: number;
}

export async function maybeCompactConversation(
  ctx: KampakuToolContext,
  config: AppConfig,
  conversationId: string,
  options: CompactHistoryOptions = {},
): Promise<boolean> {
  const threshold = options.threshold ?? COMPACTION_THRESHOLD;
  const keepRecent = options.keepRecent ?? KEEP_RECENT_MESSAGES;
  const store = ctx.conversationStore;
  const messageCount = store.countMessages(conversationId);

  if (messageCount <= threshold) {
    return false;
  }

  const allMessages = store.getAllMessages(conversationId);
  const toSummarize = allMessages.slice(0, allMessages.length - keepRecent);
  if (toSummarize.length === 0) {
    return false;
  }

  const conversation = store.requireConversation(conversationId);
  const priorSummary = conversation.summary ?? undefined;
  const summary = await buildSummary(ctx, config, toSummarize, priorSummary);
  store.compactMessages(conversationId, {
    summary,
    deleteMessageIds: toSummarize.map((message) => message.id),
  });

  return true;
}

export function buildHistoryContext(
  store: ConversationStore,
  conversationId: string,
): { summary: string | null; messages: ChatMessage[] } {
  const conversation = store.requireConversation(conversationId);
  return {
    summary: conversation.summary,
    messages: store.getChatMessages(conversationId),
  };
}

export function appendSummaryToSystemPrompt(systemPrompt: string, summary: string | null): string {
  if (!summary?.trim()) {
    return systemPrompt;
  }

  return `${systemPrompt}\n\n## Earlier conversation (summary)\n${summary.trim()}`;
}

async function buildSummary(
  ctx: KampakuToolContext,
  config: AppConfig,
  messages: StoredChatMessage[],
  priorSummary?: string,
): Promise<string> {
  const transcript = formatTranscript(messages);

  if (config.agentMode === "stub") {
    return buildDeterministicSummary(transcript, priorSummary);
  }

  const broker = createModelBroker(resolveModelProviderSettings(ctx.store, config));

  return summarizeWithLlm(broker, transcript, priorSummary);
}

export function formatTranscript(messages: StoredChatMessage[]): string {
  const lines: string[] = [];

  for (const message of messages) {
    switch (message.role) {
      case "user":
        lines.push(`User: ${message.content}`);
        break;
      case "assistant":
        if (message.toolCallsJson) {
          const toolCalls = JSON.parse(message.toolCallsJson) as Array<{
            function: { name: string };
          }>;
          const toolNames = toolCalls.map((call) => call.function.name).join(", ");
          lines.push(`Assistant: [called tools: ${toolNames}] ${message.content}`.trim());
        } else {
          lines.push(`Assistant: ${message.content}`);
        }
        break;
      case "tool":
        lines.push(`Tool result: ${message.content.slice(0, 500)}`);
        break;
      default:
        lines.push(`${message.role}: ${message.content}`);
    }
  }

  return lines.join("\n");
}

export function buildDeterministicSummary(transcript: string, priorSummary?: string): string {
  const parts: string[] = [];
  if (priorSummary?.trim()) {
    parts.push(priorSummary.trim());
  }
  parts.push(transcript.slice(0, 4000));
  return parts.join("\n\n").slice(0, 8000);
}

export async function summarizeWithLlm(
  broker: ModelBroker,
  transcript: string,
  priorSummary?: string,
): Promise<string> {
  const prompt = priorSummary?.trim()
    ? `You maintain a running summary of a conversation. Merge the previous summary with the new messages below. Preserve key facts, names, decisions, and action items. Reply in plain text only.

Previous summary:
${priorSummary.trim()}

New messages:
${transcript}`
    : `Summarize the following conversation concisely. Preserve key facts, names, decisions, and action items. Reply in plain text only.

${transcript}`;

  try {
    const response = await broker.complete([
      { role: "system", content: "You summarize conversations for long-term memory." },
      { role: "user", content: prompt },
    ]);
    const summary = response.content.trim();
    if (summary) {
      return summary;
    }
  } catch {
    // Fall back to deterministic summary.
  }

  return buildDeterministicSummary(transcript, priorSummary);
}
