import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  listConversations,
  getConversation,
  sendMessage,
  createConversation,
  deleteConversation,
} from "../../../src/lib/api/conversations";

describe("conversations API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listConversations fetches all conversations", async () => {
    const mockConversations = [{ id: "conv-1", agentSlug: "kampaku" }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: mockConversations }),
    });

    const result = await listConversations();
    expect(result.conversations).toEqual(mockConversations);
  });

  it("getConversation fetches single conversation", async () => {
    const mockConversation = { id: "conv-1", messages: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockConversation,
    });

    const result = await getConversation("conv-1");
    expect(result).toEqual(mockConversation);
  });

  it("sendMessage posts message and returns response", async () => {
    const mockResponse = { reply: "Response", conversationId: "conv-1" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await sendMessage("conv-1", "Hello");
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/conversations/conv-1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("createConversation creates new conversation", async () => {
    const mockConversation = { id: "conv-new", agentSlug: "kampaku" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockConversation,
    });

    const result = await createConversation("kampaku");
    expect(result).toEqual(mockConversation);
  });

  it("deleteConversation sends DELETE request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "",
    });

    await deleteConversation("conv-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/conversations/conv-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
