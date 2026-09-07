"use client";

import MenuRounded from "@mui/icons-material/MenuRounded";
import { useState } from "react";
import { SlideOver } from "@/components/ui/slide-over";
import { ChatComposer } from "@/components/chat/chat-composer-form";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { MessageList } from "@/components/chat/message-list-view";
import { useChat } from "@/hooks/use-chat";

interface ChatPanelProps {
  conversationId?: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const [listOpen, setListOpen] = useState(false);
  const chat = useChat(conversationId);

  const conversationList = (
    <ConversationSidebar
      conversations={chat.conversations}
      activeId={chat.activeId}
      activeSummary={chat.activeConversation?.summary}
      onSelect={(id) => {
        chat.selectConversation(id);
        setListOpen(false);
      }}
      onNew={() => {
        chat.startNewChat();
        setListOpen(false);
      }}
      onRename={chat.renameConversation}
      onDelete={chat.removeConversation}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
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
          <span className="truncate text-sm font-medium text-foreground">
            {chat.activeConversation?.title ?? "Chat"}
          </span>
        </div>

        <MessageList
          messages={chat.messages}
          loading={chat.loading}
          thinkingPhase={chat.thinkingPhase}
          toolSteps={chat.toolSteps}
          messageMetadata={chat.messageMetadata}
          onAnswerQuestion={chat.answerQuestion}
          onRequestQuestionContext={chat.requestQuestionContext}
        />

        <ChatComposer
          input={chat.input}
          loading={chat.loading}
          error={chat.error}
          onInputChange={chat.setInput}
          onSend={chat.sendMessage}
          onRetry={chat.retryLast}
        />
      </div>
    </div>
  );
}
