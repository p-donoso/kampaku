"use client";

import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useState } from "react";
import { ChatQuestionCard } from "@/components/chat-question-card";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { isQuestionAnswered, parseAssistantMessage, type ChatQuestion } from "@/lib/chat-question";
import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  allMessages: ChatMessage[];
  loading: boolean;
  metadata?: { toolsUsed?: string[]; model?: string };
  onAnswerQuestion: (question: ChatQuestion, answer: string | string[]) => void;
  onRequestQuestionContext: (question: ChatQuestion) => void;
}

export function MessageBubble({
  message,
  allMessages,
  loading,
  metadata,
  onAnswerQuestion,
  onRequestQuestionContext,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const parsed = message.role === "assistant" ? parseAssistantMessage(message.content) : null;
  let toolCalls: Array<{ name?: string }> = [];
  if (message.toolCallsJson) {
    try {
      toolCalls = (JSON.parse(message.toolCallsJson) as Array<{ function?: { name?: string } }>).map((call) => ({ name: call.function?.name }));
    } catch { /* keep malformed tool metadata collapsed */ }
  }
  const displayText = parsed?.text ?? message.content;
  const questionAnswered = parsed?.question
    ? isQuestionAnswered(allMessages, parsed.question.id)
    : false;

  async function copyContent() {
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`group max-w-[85%] rounded-2xl px-4 py-2.5 ${
          message.role === "user"
            ? "bg-brand/15 text-foreground"
            : message.role === "tool" ? "bg-surface/70 text-muted text-xs" : "bg-elevated/80 text-secondary"
        }`}
      >
        {message.role === "assistant" && (
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-[10px] font-medium text-brand">Kampaku</div>
            <Tooltip title={copied ? "Copied" : "Copy"}>
              <IconButton size="small" onClick={() => void copyContent()} aria-label="Copy message">
                <ContentCopyRounded sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </div>
        )}
        {message.role === "tool" && <div className="mb-1 text-[10px] font-medium text-muted">Tool call</div>}
        {toolCalls.length > 0 && <details className="mb-2 text-xs text-muted"><summary className="cursor-pointer font-medium">Tool calls ({toolCalls.length})</summary><ul className="mt-1 list-disc pl-4">{toolCalls.map((call, index) => <li key={`${call.name ?? "tool"}-${index}`}>{call.name ?? "Unknown tool"}</li>)}</ul></details>}
        {message.role === "tool" ? <details><summary className="cursor-pointer font-medium">Tool result</summary><pre className="mt-2 max-w-full whitespace-pre-wrap break-words">{message.content}</pre></details> : displayText && <ChatMarkdown content={displayText} />}
        {parsed?.question && (
          <ChatQuestionCard
            question={parsed.question}
            disabled={loading || questionAnswered}
            onAnswer={(answer) => onAnswerQuestion(parsed.question!, answer)}
            onRequestContext={() => onRequestQuestionContext(parsed.question!)}
          />
        )}
        {message.role === "assistant" && metadata && (metadata.toolsUsed?.length || metadata.model) && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-border/40 pt-2 text-[10px] text-muted">
            {metadata.toolsUsed?.map((tool, index) => (
              <span key={`${tool}-${index}`} className="rounded bg-surface/80 px-1.5 py-0.5">{tool}</span>
            ))}
            {metadata.model && <span className="px-1">{metadata.model}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
