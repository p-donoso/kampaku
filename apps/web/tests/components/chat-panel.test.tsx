import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/chat/chat-panel";
import { MaterialProvider } from "@/components/layout/material-provider";
import { ThemeProvider } from "@/components/layout/theme-provider";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/lib/api", () => ({
  listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
  getConversation: vi.fn().mockResolvedValue({ conversation: { id: "c1", title: "Test" }, messages: [] }),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  chatWithKampaku: vi.fn(),
}));

vi.mock("@/lib/chat-stream", () => ({
  streamChat: vi.fn().mockResolvedValue({
    reply: "Registered agents:\n- kampaku",
    conversation_id: "conv-1",
    toolsUsed: ["list_agents"],
    agentUsed: "stub",
  }),
}));

function renderPanel() {
  return render(
    <ThemeProvider>
      <MaterialProvider>
        <ChatPanel />
      </MaterialProvider>
    </ThemeProvider>,
  );
}

describe("ChatPanel", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
  });

  it("sends a message and updates the conversation route", async () => {
    const user = userEvent.setup();
    const { streamChat } = await import("@/lib/chat-stream");
  const { getConversation } = await import("@/lib/api");
  vi.mocked(getConversation).mockResolvedValue({
    conversation: {
      id: "conv-1",
      agentSlug: "kampaku",
      projectId: null,
      title: "list agents",
      summary: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    messages: [
      { id: "m1", role: "user", content: "list agents", createdAt: new Date().toISOString() },
      { id: "m2", role: "assistant", content: "Registered agents", createdAt: new Date().toISOString() },
    ],
  });

    renderPanel();
    await user.type(screen.getByPlaceholderText(/tell kampaku/i), "list agents");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(streamChat).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith("/chat/conv-1");
    });
  });
});
