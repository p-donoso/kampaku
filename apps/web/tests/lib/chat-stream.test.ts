import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamChat, parseSseBlocks } from "@/lib/chat-stream";
import type { ChatResponse } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  chatWithKampaku: vi.fn(),
}));

describe("chat-stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseSseBlocks", () => {
    it("parses SSE blocks", () => {
      const text = `event: status
data: {"phase":"thinking"}

event: done
data: {"reply":"Hello","conversation_id":"conv-1"}`;
      
      const events = parseSseBlocks(text);
      expect(events).toHaveLength(2);
      expect(events[0].event).toBe("status");
      expect(events[0].data).toEqual({ phase: "thinking" });
      expect(events[1].event).toBe("done");
    });

    it("handles empty blocks", () => {
      const text = `event: status
data: {"phase":"thinking"}


event: done
data: {"reply":"Hello","conversation_id":"conv-1"}`;
      
      const events = parseSseBlocks(text);
      expect(events).toHaveLength(2);
    });

    it("returns empty array for empty input", () => {
      const events = parseSseBlocks("");
      expect(events).toEqual([]);
    });
  });

  describe("streamChat", () => {
    it("streams and emits events", async () => {
      const mockStream = `event: status
data: {"phase":"thinking"}

event: tool
data: {"tool":"search","label":"Searching"}

event: done
data: {"reply":"Answer","conversation_id":"conv-1","toolsUsed":["search"]}

`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(mockStream));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      });

      const events: any[] = [];
      const result = await streamChat("Hello", {}, (event) => {
        events.push(event);
      });

      expect(events.length).toBeGreaterThan(0);
      expect(result.reply).toBe("Answer");
      expect(result.conversation_id).toBe("conv-1");
    });

    it("handles fetch errors by falling back", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { chatWithKampaku } = await import("@/lib/api");
      vi.mocked(chatWithKampaku).mockResolvedValue({
        reply: "Fallback",
        conversation_id: "conv-fallback",
      } as ChatResponse);

      const events: any[] = [];
      const result = await streamChat("Hello", {}, (event) => {
        events.push(event);
      });

      expect(result.reply).toBe("Fallback");
      expect(chatWithKampaku).toHaveBeenCalled();
    });

    it("handles error events in stream", async () => {
      const mockStream = `event: error
data: {"error":"Something went wrong"}

`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(mockStream));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      });

      const { chatWithKampaku } = await import("@/lib/api");
      vi.mocked(chatWithKampaku).mockResolvedValue({
        reply: "Fallback after error",
        conversation_id: "conv-err",
      } as ChatResponse);

      const events: any[] = [];
      const result = await streamChat("Hello", {}, (event) => {
        events.push(event);
      });

      expect(result.reply).toBe("Fallback after error");
    });

    it("includes optional parameters in request", async () => {
      const mockStream = `event: done
data: {"reply":"Answer","conversation_id":"conv-1"}

`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(mockStream));
          controller.close();
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      });

      await streamChat("Hello", { conversationId: "conv-existing", projectId: "proj-1" }, () => {});

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("conv-existing"),
        }),
      );
    });
  });
});
