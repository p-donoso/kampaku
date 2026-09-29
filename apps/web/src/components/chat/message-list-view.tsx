"use client";

import ForumRounded from "@mui/icons-material/ForumRounded";
import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import type { ChatQuestion } from "@/lib/chat-question";
import type { ChatMessage } from "@/lib/types";

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  thinkingPhase: "thinking" | "composing";
  toolSteps: Array<{ tool: string; label: string }>;
  messageMetadata: Record<string, { toolsUsed?: string[]; model?: string; accountingLine?: string }>;
  onAnswerQuestion: (question: ChatQuestion, answer: string | string[]) => void;
  onRequestQuestionContext: (question: ChatQuestion) => void;
}

export function MessageList({
  messages,
  loading,
  thinkingPhase,
  toolSteps,
  messageMetadata,
  onAnswerQuestion,
  onRequestQuestionContext,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, toolSteps]);

  return (
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
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            allMessages={messages}
            loading={loading}
            metadata={messageMetadata[msg.id]}
            onAnswerQuestion={onAnswerQuestion}
            onRequestQuestionContext={onRequestQuestionContext}
          />
        ))}
        {loading && <ThinkingIndicator phase={thinkingPhase} toolSteps={toolSteps} />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
