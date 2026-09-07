import type { ChatMessage, ConversationRecord } from "../types";
import { toApiError } from "../api-errors";
import { fetchJson, getBaseUrl } from "./client";

/**
 * Lists recent conversational chat sessions with agents.
 */
export function listConversations(): Promise<{
  conversations: ConversationRecord[];
}> {
  return fetchJson("/api/v1/conversations?limit=30");
}

/**
 * Retrieves conversation metadata and message history.
 * @param id - Conversation identifier.
 */
export function getConversation(id: string): Promise<{
  conversation: ConversationRecord;
  messages: ChatMessage[];
}> {
  return fetchJson(`/api/v1/conversations/${encodeURIComponent(id)}`);
}

/**
 * Updates the title of an existing conversation.
 */
export function updateConversation(id: string, title: string): Promise<{ conversation: ConversationRecord }> {
  return fetchJson(`/api/v1/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

/**
 * Deletes a conversation session and all its stored messages.
 */
export function deleteConversation(id: string): Promise<void> {
  return fetch(`${getBaseUrl()}/api/v1/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
    async (res) => {
      if (!res.ok) {
        const body = await res.text();
        throw toApiError(`/api/v1/conversations/${id}`, res.status, body);
      }
    },
  );
}

/**
 * Sends a chat message to Kampaku advisor runtime.
 */
export function chatWithKampaku(
  message: string,
  options: { conversationId?: string; projectId?: string } = {},
): Promise<{
  reply: string;
  conversation_id: string;
  toolsUsed?: string[];
  agentUsed?: "llm" | "stub";
  model?: string;
}> {
  return fetchJson("/api/v1/agents/kampaku/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      conversation_id: options.conversationId,
      project_id: options.projectId,
    }),
  });
}
