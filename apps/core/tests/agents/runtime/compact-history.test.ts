import { describe, it, expect } from "vitest";
import {
  formatTranscript,
  buildDeterministicSummary,
  appendSummaryToSystemPrompt,
} from "../../../src/agents/runtime/compact-history.js";
import type { StoredChatMessage } from "../../../src/persistence/conversation-store.js";

describe("compact-history", () => {
  const mockMessage = (overrides: Partial<StoredChatMessage> = {}): StoredChatMessage => ({
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "Test message",
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe("formatTranscript", () => {
    it("formats user messages", () => {
      const messages = [mockMessage({ role: "user", content: "Hello" })];
      const transcript = formatTranscript(messages);
      expect(transcript).toBe("User: Hello");
    });

    it("formats assistant messages", () => {
      const messages = [mockMessage({ role: "assistant", content: "Hi there" })];
      const transcript = formatTranscript(messages);
      expect(transcript).toBe("Assistant: Hi there");
    });

    it("formats assistant with tool calls", () => {
      const messages = [
        mockMessage({
          role: "assistant",
          content: "Done",
          toolCallsJson: JSON.stringify([
            { function: { name: "get_project" } },
            { function: { name: "list_agents" } },
          ]),
        }),
      ];
      const transcript = formatTranscript(messages);
      expect(transcript).toContain("[called tools: get_project, list_agents]");
      expect(transcript).toContain("Done");
    });

    it("formats tool results", () => {
      const messages = [mockMessage({ role: "tool", content: "Tool output here" })];
      const transcript = formatTranscript(messages);
      expect(transcript).toBe("Tool result: Tool output here");
    });

    it("truncates long tool results", () => {
      const longContent = "A".repeat(1000);
      const messages = [mockMessage({ role: "tool", content: longContent })];
      const transcript = formatTranscript(messages);
      expect(transcript.length).toBeLessThan(520);
      expect(transcript).toContain("Tool result:");
    });

    it("formats multiple messages", () => {
      const messages = [
        mockMessage({ id: "1", role: "user", content: "Question" }),
        mockMessage({ id: "2", role: "assistant", content: "Answer" }),
      ];
      const transcript = formatTranscript(messages);
      expect(transcript).toContain("User: Question");
      expect(transcript).toContain("Assistant: Answer");
    });

    it("returns empty string for empty messages", () => {
      expect(formatTranscript([])).toBe("");
    });

    it("handles system role", () => {
      const messages = [mockMessage({ role: "system", content: "System message" })];
      const transcript = formatTranscript(messages);
      expect(transcript).toBe("system: System message");
    });
  });

  describe("buildDeterministicSummary", () => {
    it("returns transcript when no prior summary", () => {
      const transcript = "User: Hello\nAssistant: Hi";
      const summary = buildDeterministicSummary(transcript);
      expect(summary).toBe(transcript);
    });

    it("merges prior summary with transcript", () => {
      const prior = "Previous conversation about X";
      const transcript = "User: New question\nAssistant: New answer";
      const summary = buildDeterministicSummary(transcript, prior);
      expect(summary).toContain(prior);
      expect(summary).toContain("New question");
    });

    it("truncates transcript to 4000 chars", () => {
      const transcript = "A".repeat(5000);
      const summary = buildDeterministicSummary(transcript);
      expect(summary.length).toBeLessThanOrEqual(4000);
    });

    it("truncates final summary to 8000 chars", () => {
      const prior = "B".repeat(5000);
      const transcript = "C".repeat(5000);
      const summary = buildDeterministicSummary(transcript, prior);
      expect(summary.length).toBeLessThanOrEqual(8000);
    });

    it("trims prior summary whitespace", () => {
      const prior = "  Prior  \n\n";
      const transcript = "New";
      const summary = buildDeterministicSummary(transcript, prior);
      expect(summary).toContain("Prior");
      expect(summary).not.toContain("  Prior  ");
    });
  });

  describe("appendSummaryToSystemPrompt", () => {
    it("returns prompt unchanged when no summary", () => {
      const prompt = "You are a helpful assistant";
      expect(appendSummaryToSystemPrompt(prompt, null)).toBe(prompt);
      expect(appendSummaryToSystemPrompt(prompt, "")).toBe(prompt);
      expect(appendSummaryToSystemPrompt(prompt, "   ")).toBe(prompt);
    });

    it("appends summary to prompt", () => {
      const prompt = "You are a helpful assistant";
      const summary = "Prior conversation about topic X";
      const result = appendSummaryToSystemPrompt(prompt, summary);
      expect(result).toContain(prompt);
      expect(result).toContain("## Earlier conversation (summary)");
      expect(result).toContain(summary);
    });

    it("trims summary whitespace", () => {
      const prompt = "Prompt";
      const summary = "  Summary  \n\n";
      const result = appendSummaryToSystemPrompt(prompt, summary);
      expect(result).toContain("Summary");
      expect(result).not.toContain("  Summary  ");
    });
  });
});
