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
      // Where the turn's time went, as Core rendered it. Present on every turn and not only on a stop,
      // because the question "why did that take eleven minutes?" is asked about turns that finished
      // (BOARD F-060).
      accounting_line: "12s total · 1 model call in 4s (slowest 4s) · 1 tool call",
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

    // The reply's metadata carries where the turn's time went, on a turn that finished. The question an
    // operator asks — *"why did that take eleven minutes?"* — is not only asked about stops (F-060).
    await waitFor(() => {
      expect(result.current.messageMetadata["m2"]?.accountingLine).toContain("12s total");
    });
  });
});
