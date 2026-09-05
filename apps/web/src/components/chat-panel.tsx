"use client";

import AddRounded from "@mui/icons-material/AddRounded";
import ForumRounded from "@mui/icons-material/ForumRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { ChatQuestionCard } from "@/components/chat-question-card";
import { chatWithKampaku, getConversation, listConversations } from "@/lib/api";
import { formatContextRequest, formatQuestionAnswer, parseAssistantMessage, type ChatQuestion } from "@/lib/chat-question";
import type { ChatMessage, ConversationRecord } from "@/lib/types";

export function ChatPanel() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const optimisticIdRef = useRef(0);

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
      const { messages: msgs } = await getConversation(id);
      setMessages(msgs.filter((m) => m.role === "user" || m.role === "assistant") as ChatMessage[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadConversations, 0);
    return () => window.clearTimeout(timeout);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    const timeout = window.setTimeout(() => loadMessages(activeId), 0);
    return () => window.clearTimeout(timeout);
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setError(null);

    optimisticIdRef.current += 1;
    const optimistic: ChatMessage = {
      id: `tmp-${optimisticIdRef.current}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await chatWithKampaku(text, { conversationId: activeId });
      setActiveId(res.conversation_id);
      await loadConversations();
      await loadMessages(res.conversation_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await sendMessage(input.trim());
  }

  function answerQuestion(question: ChatQuestion, answer: string | string[]) {
    void sendMessage(formatQuestionAnswer(question, answer));
  }

  function requestQuestionContext(question: ChatQuestion) {
    void sendMessage(formatContextRequest(question));
  }

  function startNewChat() {
    setActiveId(undefined);
    setMessages([]);
    setError(null);
    setListOpen(false);
  }

  function selectConversation(id: string) {
    setActiveId(id);
    setListOpen(false);
  }

  const conversationList = (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <span className="text-xs font-medium text-secondary">Conversations</span>
        <Button onClick={startNewChat} size="small" color="inherit" startIcon={<AddRounded />}>
          New
        </Button>
      </div>
      <List dense className="flex-1 overflow-y-auto p-2">
        {conversations.map((c) => (
          <ListItemButton
            key={c.id}
            onClick={() => selectConversation(c.id)}
            selected={activeId === c.id}
            className="!mb-1 !rounded-lg"
          >
            <ListItemText
              primary={c.title ?? "Untitled"}
              secondary={new Date(c.updatedAt).toLocaleDateString()}
              slotProps={{ primary: { noWrap: true, variant: "caption" }, secondary: { variant: "caption" } }}
            />
          </ListItemButton>
        ))}
      </List>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
        {conversationList}
      </div>

      <SlideOver open={listOpen} onClose={() => setListOpen(false)} title="Conversations" side="left">
        <div className="flex h-full flex-col">{conversationList}</div>
      </SlideOver>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <button
            type="button"
            className="icon-button"
            onClick={() => setListOpen(true)}
            aria-label="Open conversations"
          >
            <MenuRounded fontSize="small" />
          </button>
          <span className="truncate text-sm font-medium text-foreground">Chat</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && !loading && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <ForumRounded className="!text-5xl opacity-20" />
                <p className="mt-3 text-sm text-muted">
                  Talk to Kampaku — plan, delegate, create agents
                </p>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((msg) => {
              const parsed = msg.role === "assistant" ? parseAssistantMessage(msg.content) : null;
              return (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand/15 text-foreground"
                      : "bg-elevated/80 text-secondary"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="mb-1 text-[10px] font-medium text-brand">Kampaku</div>
                  )}
                  {(parsed?.text || !parsed) && <div className="whitespace-pre-wrap">{parsed?.text ?? msg.content}</div>}
                  {parsed?.question && (
                    <ChatQuestionCard
                      question={parsed.question}
                      disabled={loading}
                      onAnswer={(answer) => answerQuestion(parsed.question!, answer)}
                      onRequestContext={() => requestQuestionContext(parsed.question!)}
                    />
                  )}
                </div>
              </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-elevated/80 px-4 py-3 text-sm text-muted">
                  <CircularProgress size={14} color="inherit" /> Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && (
          <Alert severity="error" className="!mx-4 !mb-2">{error}</Alert>
        )}

        <form
          onSubmit={handleSend}
          className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto flex max-w-2xl gap-2">
            <TextField
              fullWidth
              size="small"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell Kampaku what you want to accomplish…"
              disabled={loading}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !input.trim()}
              endIcon={<SendRounded />}
            >
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
