import { describe, it, expect, vi, beforeEach } from "vitest";
import * as conversationsApi from "@/lib/api/conversations";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  fetchJson: vi.fn(),
  getBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

describe("conversations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listConversations fetches recent conversations", async () => {
    const mockData = { conversations: [{ id: "c1", title: "Chat 1" }] };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await conversationsApi.listConversations();

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/conversations?limit=30");
    expect(result).toEqual(mockData);
  });

  it("getConversation fetches conversation with messages", async () => {
    const mockData = {
      conversation: { id: "c1", title: "Chat" },
      messages: [{ id: "m1", content: "Hello" }],
    };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await conversationsApi.getConversation("c1");

    expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/conversations/c1");
    expect(result).toEqual(mockData);
  });

  it("updateConversation updates title", async () => {
    const mockData = { conversation: { id: "c1", title: "Updated" } };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await conversationsApi.updateConversation("c1", "Updated");

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/conversations/c1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }),
    );
    expect(result).toEqual(mockData);
  });

  it("chatWithKampaku sends message", async () => {
    const mockData = {
      reply: "Response",
      conversation_id: "c1",
      toolsUsed: ["get_project"],
    };
    vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

    const result = await conversationsApi.chatWithKampaku("Hello", {
      conversationId: "c1",
      projectId: "p1",
    });

    expect(client.fetchJson).toHaveBeenCalledWith(
      "/api/v1/agents/kampaku/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Hello",
          conversation_id: "c1",
          project_id: "p1",
        }),
      }),
    );
    expect(result).toEqual(mockData);
  });
});
