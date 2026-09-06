"use client";

import ForumRounded from "@mui/icons-material/ForumRounded";
import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import type { ChatQuestion } from "@/lib/chat-question";
import type { ChatMessage } from "@/lib/types";

function ToolActivityBubble({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-surface/70 px-4 py-2.5 text-xs text-muted">
        <details>
          <summary className="cursor-pointer font-medium">Tool activity ({messages.length})</summary>
          <ol className="mt-2 space-y-2 border-t border-border/40 pt-2">
            {messages.map((message, index) => (
              <li key={message.id}>
                <div className="text-[10px] font-medium text-muted">Step {index + 1}</div>
                {message.toolCallsJson ? (
                  <div className="mt-1 text-[11px]">Tool call: {(() => {
                    try {
                      return (JSON.parse(message.toolCallsJson) as Array<{ function?: { name?: string } }>).map((call) => call.function?.name ?? "unknown").join(", ");
                    } catch {
                      return "unknown";
                    }
                  })()}</div>
                ) : (
                  <pre className="mt-1 max-w-full whitespace-pre-wrap break-words text-[11px]">{message.content}</pre>
                )}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  thinkingPhase: "thinking" | "composing";
  toolSteps: Array<{ tool: string; label: string }>;
  messageMetadata: Record<string, { toolsUsed?: string[]; model?: string }>;
  onAnswerQuestion: (question: ChatQuestion, answer: string | string[]) => void;
  onRequestQuestionContext: (question: ChatQuestion) => void;
  error?: string | null;
  onRetry?: () => void;
}

export function MessageList({
  messages,
  loading,
  thinkingPhase,
  toolSteps,
  messageMetadata,
  onAnswerQuestion,
  onRequestQuestionContext,
  error,
  onRetry,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, toolSteps]);

  return (
    <div className="flex-1 overflow-y-auto p-4" onScroll={(event) => {
      const target = event.currentTarget;
      nearBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 96;
    }}>
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
        {messages.map((msg, index) => {
          const isToolActivity = msg.role === "tool" || Boolean(msg.toolCallsJson);
          if (isToolActivity) {
            const previousIsToolActivity = index > 0 && (messages[index - 1]?.role === "tool" || Boolean(messages[index - 1]?.toolCallsJson));
            if (previousIsToolActivity) return null;
            const toolMessages: ChatMessage[] = [];
            for (let cursor = index; cursor < messages.length; cursor += 1) {
              if (messages[cursor]?.role !== "tool" && !messages[cursor]?.toolCallsJson) break;
              toolMessages.push(messages[cursor]);
            }
            return <ToolActivityBubble key={`tool-group-${msg.id}`} messages={toolMessages} />;
          }
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              allMessages={messages}
              loading={loading}
              metadata={messageMetadata[msg.id]}
              onAnswerQuestion={onAnswerQuestion}
              onRequestQuestionContext={onRequestQuestionContext}
            />
          );
        })}
        {loading && <ThinkingIndicator phase={thinkingPhase} toolSteps={toolSteps} />}
        {error && !loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <p>{error}</p>
              {onRetry && <button type="button" className="mt-2 rounded-md border border-red-300/40 px-3 py-1 text-xs font-medium hover:bg-red-500/20" onClick={onRetry}>Retry</button>}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
