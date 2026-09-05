import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendSummaryToSystemPrompt,
  buildDeterministicSummary,
  formatTranscript,
  maybeCompactConversation,
} from "../src/agents/runtime/compact-history.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { Store } from "../src/persistence/store.js";
import type { KampakuToolContext } from "../src/agents/runtime/tools/index.js";

const mockBroker = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock("../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

describe("compact-history", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function createContext(agentMode: "stub" | "llm" = "stub") {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-compact-history-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode,
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const ctx: KampakuToolContext = { store, agentStore, conversationStore, pmStore, config };
    return { ctx, config, conversationStore };
  }

  it("formats transcript with user, assistant, and tool messages", () => {
    const transcript = formatTranscript([
      {
        id: "1",
        conversationId: "c1",
        role: "user",
        content: "Hello",
        toolCallsJson: null,
        toolCallId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        conversationId: "c1",
        role: "assistant",
        content: "Hi",
        toolCallsJson: null,
        toolCallId: null,
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ]);

    expect(transcript).toContain("User: Hello");
    expect(transcript).toContain("Assistant: Hi");
  });

  it("appends summary to system prompt", () => {
    const prompt = appendSummaryToSystemPrompt("Base prompt", "User asked about projects.");
    expect(prompt).toContain("Base prompt");
    expect(prompt).toContain("Earlier conversation (summary)");
    expect(prompt).toContain("User asked about projects.");
  });

  it("compacts old messages and keeps recent ones in stub mode", async () => {
    const { ctx, config, conversationStore } = createContext("stub");
    const conversation = conversationStore.createConversation();

    for (let index = 0; index < 10; index += 1) {
      conversationStore.appendMessage(conversation.id, {
        role: "user",
        content: `message-${index}`,
      });
      conversationStore.appendMessage(conversation.id, {
        role: "assistant",
        content: `reply-${index}`,
      });
    }

    expect(conversationStore.countMessages(conversation.id)).toBe(20);

    const compacted = await maybeCompactConversation(ctx, config, conversation.id, {
      threshold: 6,
      keepRecent: 4,
    });

    expect(compacted).toBe(true);
    expect(conversationStore.countMessages(conversation.id)).toBe(4);
    expect(conversationStore.getConversation(conversation.id)?.summary).toContain("message-0");
    expect(conversationStore.getAllMessages(conversation.id)[0]?.content).toBe("message-8");
  });

  it("merges prior summary when compacting again", async () => {
    const { ctx, config, conversationStore } = createContext("stub");
    const conversation = conversationStore.createConversation();

    for (let index = 0; index < 8; index += 1) {
      conversationStore.appendMessage(conversation.id, { role: "user", content: `old-${index}` });
      conversationStore.appendMessage(conversation.id, { role: "assistant", content: `old-reply-${index}` });
    }

    await maybeCompactConversation(ctx, config, conversation.id, {
      threshold: 4,
      keepRecent: 2,
    });

    const firstSummary = conversationStore.getConversation(conversation.id)?.summary;
    expect(firstSummary).toBeTruthy();

    conversationStore.appendMessage(conversation.id, { role: "user", content: "new-1" });
    conversationStore.appendMessage(conversation.id, { role: "assistant", content: "new-reply-1" });
    conversationStore.appendMessage(conversation.id, { role: "user", content: "new-2" });
    conversationStore.appendMessage(conversation.id, { role: "assistant", content: "new-reply-2" });

    await maybeCompactConversation(ctx, config, conversation.id, {
      threshold: 4,
      keepRecent: 2,
    });

    const secondSummary = conversationStore.getConversation(conversation.id)?.summary;
    expect(secondSummary).toContain(firstSummary!);
  });

  it("uses LLM summary in llm mode", async () => {
    const { ctx, config, conversationStore } = createContext("llm");
    const conversation = conversationStore.createConversation();

    for (let index = 0; index < 6; index += 1) {
      conversationStore.appendMessage(conversation.id, { role: "user", content: `msg-${index}` });
      conversationStore.appendMessage(conversation.id, { role: "assistant", content: `reply-${index}` });
    }

    mockBroker.complete.mockResolvedValue({ content: "Condensed memory.", model: "test-model" });

    await maybeCompactConversation(ctx, config, conversation.id, {
      threshold: 4,
      keepRecent: 2,
    });

    expect(mockBroker.complete).toHaveBeenCalledOnce();
    expect(conversationStore.getConversation(conversation.id)?.summary).toBe("Condensed memory.");
  });

  it("falls back to deterministic summary when LLM fails", async () => {
    mockBroker.complete.mockRejectedValue(new Error("provider down"));

    const summary = buildDeterministicSummary("User: alpha\nAssistant: beta", "Previous context");
    expect(summary).toContain("Previous context");
    expect(summary).toContain("User: alpha");
  });
});
