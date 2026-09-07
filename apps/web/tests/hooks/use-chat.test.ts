import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/hooks/use-chat";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/lib/api", () => ({
  listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
  getConversation: vi.fn().mockResolvedValue({
    conversation: {
      id: "conv-1",
      agentSlug: "kampaku",
      projectId: null,
      title: "Test",
      summary: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    messages: [
      { id: "m1", role: "user", content: "list agents", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "m2", role: "assistant", content: "Registered agents", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
  }),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("@/lib/chat-stream", () => ({
  streamChat: vi.fn(async (_message, _options, onEvent) => {
    onEvent({ type: "status", phase: "thinking" });
    onEvent({ type: "tool", tool: "list_agents", label: "Listing agents" });
    const response = {
      reply: "Registered agents",
      conversation_id: "conv-1",
      toolsUsed: ["list_agents"],
      agentUsed: "stub" as const,
    };
    onEvent({ type: "done", response });
    return response;
  }),
}));

describe("useChat", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
  });

  it("streams a message and navigates to the new conversation", async () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.setInput("list agents");
    });

    act(() => {
      result.current.sendMessage();
    });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/chat/conv-1");
    });
  });
});
