"use client";

import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useState } from "react";
import { ChatMarkdown } from "@/components/chat/chat-markdown";

interface ConversationSummaryProps {
  summary: string | null | undefined;
}

export function ConversationSummary({ summary }: ConversationSummaryProps) {
  const [open, setOpen] = useState(false);
  if (!summary?.trim()) return null;

  return (
    <section className="border-b border-border px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-xs font-medium text-secondary"
        onClick={() => setOpen((current) => !current)}
      >
        Earlier context
        <ExpandMoreRounded className={open ? "rotate-180" : ""} fontSize="small" />
      </button>
      {open && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-elevated/50 p-2">
          <ChatMarkdown content={summary} />
        </div>
      )}
    </section>
  );
}
