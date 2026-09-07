import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

describe("conversation api", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-conversation-api-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore);
    return { app, conversationStore };
  }

  it("returns conversation summary on GET", async () => {
    const { app, conversationStore } = createTestApp();
    const conversation = conversationStore.createConversation({ title: "Planning" });
    conversationStore.compactMessages(conversation.id, {
      summary: "Earlier we discussed deployment options.",
      deleteMessageIds: [],
    });

    const res = await app.request(`/api/v1/conversations/${conversation.id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { conversation: { summary: string | null } };
    expect(body.conversation.summary).toBe("Earlier we discussed deployment options.");
  });

  it("updates conversation title via PATCH", async () => {
    const { app, conversationStore } = createTestApp();
    const conversation = conversationStore.createConversation();

    const res = await app.request(`/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed chat" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { conversation: { title: string } };
    expect(body.conversation.title).toBe("Renamed chat");
  });

  it("deletes conversation and messages via DELETE", async () => {
    const { app, conversationStore } = createTestApp();
    const conversation = conversationStore.createConversation();
    conversationStore.appendMessage(conversation.id, { role: "user", content: "hello" });

    const res = await app.request(`/api/v1/conversations/${conversation.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(conversationStore.getConversation(conversation.id)).toBeUndefined();
    expect(conversationStore.getMessages(conversation.id)).toHaveLength(0);
  });
});

describe("chat stream api", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-chat-stream-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    return createApp(store, config, agentStore, pmStore, conversationStore, skillStore);
  }

  async function readSseEvents(response: Response): Promise<Array<{ event: string; data: unknown }>> {
    const text = await response.text();
    const events: Array<{ event: string; data: unknown }> = [];
    const blocks = text.split("\n\n").filter(Boolean);
    for (const block of blocks) {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!eventLine || !dataLine) continue;
      events.push({
        event: eventLine.replace("event:", "").trim(),
        data: JSON.parse(dataLine.replace("data:", "").trim()),
      });
    }
    return events;
  }

  it("streams status, tool, and done events in stub mode", async () => {
    const app = createTestApp();
    const res = await app.request("/api/v1/agents/kampaku/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "list agents" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = await readSseEvents(res);
    expect(events.some((event) => event.event === "status" && (event.data as { phase: string }).phase === "thinking")).toBe(true);
    expect(events.some((event) => event.event === "tool" && (event.data as { tool: string }).tool === "list_agents")).toBe(true);
    const done = events.find((event) => event.event === "done");
    expect(done).toBeDefined();
    expect((done!.data as { reply: string }).reply).toContain("Registered agents");
  });

  it("does not stream a mutating planning tool for advisor project requests", async () => {
    const app = createTestApp();
    const res = await app.request("/api/v1/agents/kampaku/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Create a project called Demo App with tasks" }),
    });
    const events = await readSseEvents(res);
    expect(events.some((event) => event.event === "tool" && (event.data as { tool: string }).tool === "submit_intent")).toBe(false);
  });
});
