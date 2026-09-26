import { chatWithKampaku } from "./api";
import type { ChatResponse } from "./types";

export type ChatStreamEvent =
  | { type: "status"; phase: "thinking" | "composing" }
  | { type: "tool"; tool: string; label: string }
  | { type: "done"; response: ChatResponse }
  | { type: "error"; error: string };

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return (
    process.env.KAMPAKU_CORE_URL ??
    process.env.NEXT_PUBLIC_KAMPAKU_API_URL ??
    "http://127.0.0.1:28080"
  ).replace(/\/$/, "");
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return null;
  return {
    event: eventLine.replace("event:", "").trim(),
    data: dataLine.replace("data:", "").trim(),
  };
}

export async function streamChat(
  message: string,
  options: { conversationId?: string; projectId?: string } = {},
  onEvent: (event: ChatStreamEvent) => void,
): Promise<ChatResponse> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/v1/agents/kampaku/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        message,
        conversation_id: options.conversationId,
        project_id: options.projectId,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Stream request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResponse: ChatResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (!parsed) continue;

        if (parsed.event === "status") {
          const payload = JSON.parse(parsed.data) as { phase: "thinking" | "composing" };
          onEvent({ type: "status", phase: payload.phase });
        } else if (parsed.event === "tool") {
          const payload = JSON.parse(parsed.data) as { tool: string; label: string };
          onEvent({ type: "tool", tool: payload.tool, label: payload.label });
        } else if (parsed.event === "done") {
          const payload = JSON.parse(parsed.data) as {
            reply: string;
            conversation_id: string;
            toolsUsed?: string[];
            agentUsed?: "llm" | "stub";
            model?: string;
          };
          finalResponse = {
            reply: payload.reply,
            conversation_id: payload.conversation_id,
            toolsUsed: payload.toolsUsed,
            agentUsed: payload.agentUsed,
            model: payload.model,
          };
          onEvent({ type: "done", response: finalResponse });
        } else if (parsed.event === "error") {
          const payload = JSON.parse(parsed.data) as { error?: string };
          throw new Error(payload.error ?? "Chat stream failed");
        }
      }
    }

    if (!finalResponse) {
      throw new Error("Chat stream ended without a response");
    }
    return finalResponse;
  } catch {
    const fallback = await chatWithKampaku(message, options);
    onEvent({ type: "done", response: fallback });
    return fallback;
  }
}

export function parseSseBlocks(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split("\n\n").filter(Boolean)) {
    const parsed = parseSseBlock(block);
    if (!parsed) continue;
    events.push({ event: parsed.event, data: JSON.parse(parsed.data) });
  }
  return events;
}
