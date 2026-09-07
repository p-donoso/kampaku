import { describe, expect, it } from "vitest";
import { parseSseBlocks } from "@/lib/chat-stream";

describe("chat stream parser", () => {
  it("parses status, tool, and done SSE blocks", () => {
    const text = [
      "event: status",
      'data: {"phase":"thinking"}',
      "",
      "event: tool",
      'data: {"tool":"list_agents","label":"Listing agents"}',
      "",
      "event: done",
      'data: {"reply":"Hello","conversation_id":"abc"}',
      "",
    ].join("\n");

    const events = parseSseBlocks(text);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ event: "status", data: { phase: "thinking" } });
    expect(events[1]).toEqual({ event: "tool", data: { tool: "list_agents", label: "Listing agents" } });
    expect(events[2].event).toBe("done");
  });
});
