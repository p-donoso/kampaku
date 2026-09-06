"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteConversation,
  getConversation,
  getConversationStatus,
  listConversations,
  retryChat,
  updateConversation,
} from "@/lib/api";
import { formatContextRequest, formatQuestionAnswer, type ChatQuestion } from "@/lib/chat-question";
import { streamChat } from "@/lib/chat-stream";
import type { ChatMessage, ConversationRecord } from "@/lib/types";

export function useChat(initialConversationId?: string) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(initialConversationId);
  const [activeConversation, setActiveConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState<"thinking" | "composing">("thinking");
  const [toolSteps, setToolSteps] = useState<Array<{ tool: string; label: string }>>([]);
  const [messageMetadata, setMessageMetadata] = useState<Record<string, { toolsUsed?: string[]; model?: string }>>({});
  const lastFailedMessageRef = useRef<string | null>(null);
  const visibleMessages = (items: ChatMessage[]) => items.filter((m) => m.role === "user" || m.role === "tool" || (m.role === "assistant" && (m.content.trim().length > 0 || Boolean(m.toolCallsJson))));

  const loadConversations = useCallback(async () => {
    try {
      const { conversations: list } = await listConversations();
      setConversations(list);
    } catch {
      /* core offline */
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const { conversation, messages: msgs } = await getConversation(id);
      setActiveConversation(conversation);
      setMessages(visibleMessages(msgs as ChatMessage[]));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation");
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 3000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    setActiveId(initialConversationId);
  }, [initialConversationId]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setActiveConversation(null);
      return;
    }
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  // Keep an open conversation in sync when work continues elsewhere (CLI,
  // another tab, a retry, or a long-running provider request). This is an
  // explicit read-only refresh; retries remain user-triggered.
  useEffect(() => {
    if (!activeId) return;
    const source = new EventSource(`/api/v1/conversations/${encodeURIComponent(activeId)}/events`);
    const refresh = async () => {
      try {
        const status = await getConversationStatus(activeId);
        setRemoteRunning(status.running);
        const { conversation, messages: nextMessages } = await getConversation(activeId);
        setActiveConversation(conversation);
        setMessages(visibleMessages(nextMessages as ChatMessage[]));
      } catch {
        // Keep the current conversation visible during transient refresh failures.
      }
    };
    source.addEventListener("conversation", () => void refresh());
    return () => source.close();
  }, [activeId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setError(null);
    setThinkingPhase("thinking");
    setToolSteps([]);
    lastFailedMessageRef.current = text;

    try {
      const response = await streamChat(text, { conversationId: activeId }, (event) => {
        if (event.type === "status") {
          setThinkingPhase(event.phase);
        } else if (event.type === "tool") {
          setToolSteps((prev) => [...prev, { tool: event.tool, label: event.label }]);
        }
      });

      if (!activeId) {
        router.replace(`/chat/${response.conversation_id}`);
      }
      setActiveId(response.conversation_id);
      await loadConversations();
      const { messages: msgs, conversation } = await getConversation(response.conversation_id);
      setActiveConversation(conversation);
      const visible = visibleMessages(msgs as ChatMessage[]);
      setMessages(visible);
      const lastAssistant = [...visible].reverse().find((m) => m.role === "assistant");
      if (lastAssistant) {
        setMessageMetadata((prev) => ({
          ...prev,
          [lastAssistant.id]: { toolsUsed: response.toolsUsed, model: response.model },
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setLoading(false);
      setToolSteps([]);
    }
  }, [activeId, loadConversations, loading, router]);

  function answerQuestion(question: ChatQuestion, answer: string | string[]) {
    void sendMessage(formatQuestionAnswer(question, answer));
  }

  function requestQuestionContext(question: ChatQuestion) {
    void sendMessage(formatContextRequest(question));
  }

  function startNewChat() {
    setActiveId(undefined);
    setMessages([]);
    setActiveConversation(null);
    setError(null);
    router.push("/chat");
  }

  function selectConversation(id: string) {
    router.push(`/chat/${id}`);
  }

  async function renameConversation(id: string, title: string) {
    await updateConversation(id, title);
    await loadConversations();
    if (activeId === id) {
      setActiveConversation((current) => (current ? { ...current, title } : current));
    }
  }

  async function removeConversation(id: string) {
    await deleteConversation(id);
    await loadConversations();
    if (activeId === id) {
      startNewChat();
    }
  }

  return {
    conversations,
    activeId,
    activeConversation,
    messages,
    input,
    setInput,
    loading: loading || remoteRunning,
    error,
    thinkingPhase,
    toolSteps,
    messageMetadata,
    sendMessage: () => void sendMessage(input.trim()),
    retryLast: () => {
      if (activeId) {
        setError(null);
        setLoading(true);
        setThinkingPhase("thinking");
        setToolSteps([]);
        void retryChat(activeId)
          .then(async () => loadMessages(activeId))
          .catch((e) => {
            setError(e instanceof Error ? e.message : "Failed to retry message");
          })
          .finally(() => setLoading(false));
      } else if (lastFailedMessageRef.current) void sendMessage(lastFailedMessageRef.current);
    },
    answerQuestion,
    requestQuestionContext,
    startNewChat,
    selectConversation,
    renameConversation,
    removeConversation,
  };
}
