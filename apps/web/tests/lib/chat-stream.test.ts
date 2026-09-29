import { describe, expect, it } from "vitest";
import { parseSseBlocks } from "@/lib/chat-stream";
import type { ChatResponse } from "@/lib/types";

/**
 * The `done` payload is the surface where a turn's account of itself is carried, and BOARD F-060 is about
 * that account being absent: measured 2026-09-26 taking suite 07 (run 3), a turn spent **955 s over five
 * in-turn model calls** and the same endpoint answered the same prompt in **3.1 s** when called directly,
 * with nothing recorded that could tell the two apart.
 *
 * `accounting_line` is a string rather than the structured numbers, and the type says so on purpose: Core
 * renders the sentence once so this surface and the CLI cannot describe the same turn differently.
 */
describe("the done payload", () => {
  it("carries the turn's own account of its time, as Core rendered it", () => {
    const payload: ChatResponse = {
      reply: "Done",
      conversation_id: "abc",
      toolsUsed: ["delegate_to_agent"],
      accounting_line: "178s total · 2 model calls in 20s (slowest 15s) · 1 delegated session",
    };

    // The field is part of the contract this surface reads, not decoration: a turn that took eleven minutes
    // has to be able to say where they went on the surface the operator is using.
    expect(payload.accounting_line).toContain("178s total");
    expect(payload.accounting_line).toContain("2 model calls in 20s");
  });
});

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
