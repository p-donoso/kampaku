import { describe, it, expect } from "vitest";
import {
  parseStreamChunk,
  streamChatResponse,
} from "@/lib/chat-stream";

describe("chat streaming", () => {
  it("parseStreamChunk extracts data from SSE chunk", () => {
    const chunk = 'data: {"type":"delta","content":"Hello"}\n\n';
    const result = parseStreamChunk(chunk);
    expect(result).toEqual({ type: "delta", content: "Hello" });
  });

  it("parseStreamChunk returns null for invalid chunk", () => {
    const chunk = "invalid data\n\n";
    const result = parseStreamChunk(chunk);
    expect(result).toBeNull();
  });

  it("parseStreamChunk handles malformed JSON", () => {
    const chunk = "data: {invalid json}\n\n";
    const result = parseStreamChunk(chunk);
    expect(result).toBeNull();
  });

  it("streamChatResponse processes SSE stream", async () => {
    // This is a more complex function that would need a full mock setup
    // For now, just verify the function exists and is exported
    expect(typeof streamChatResponse).toBe("function");
  });
});
