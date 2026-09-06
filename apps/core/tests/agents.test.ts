import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore, AgentStoreError } from "../src/persistence/agent-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { MemoryStore } from "../src/persistence/memory-store.js";
import { Store } from "../src/persistence/store.js";
import type { KampakuToolContext } from "../src/agents/runtime/tools/index.js";
import { runKampakuChat } from "../src/agents/runtime/session.js";
import {
  buildStubSystemPrompt,
  isListAgentsRequest,
  parseSubAgentRequest,
} from "../src/agents/runtime/stub-agent.js";
import { executeCreateSubAgent } from "../src/agents/runtime/tools/create-sub-agent.js";

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

describe("conversation-store", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createConversationStore() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-conversation-store-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    return new ConversationStore(db);
  }

  it("creates conversations and stores messages", () => {
    const store = createConversationStore();
    const conversation = store.createConversation({ title: "Test chat" });

    store.appendMessage(conversation.id, { role: "user", content: "Hello" });
    store.appendMessage(conversation.id, { role: "assistant", content: "Hi there" });

    const messages = store.getMessages(conversation.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.content).toBe("Hi there");
  });

  it("restores tool call messages for LLM history", () => {
    const store = createConversationStore();
    const conversation = store.createConversation();

    store.appendMessage(conversation.id, {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: { name: "list_agents", arguments: "{}" },
        },
      ],
    });
    store.appendMessage(conversation.id, {
      role: "tool",
      tool_call_id: "call-1",
      content: '{"ok":true}',
    });

    const chatMessages = store.getChatMessages(conversation.id);
    expect(chatMessages[0]?.tool_calls?.[0]?.function.name).toBe("list_agents");
    expect(chatMessages[1]?.tool_call_id).toBe("call-1");
  });
});

describe("agent-store", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStore() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-agent-store-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    return new AgentStore(db);
  }

  it("includes kampaku builtin agent in list", () => {
    const store = createStore();
    const agents = store.listAllAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]?.slug).toBe("kampaku");
    expect(agents[0]?.source).toBe("builtin");
  });

  it("creates and deletes generated sub-agents", () => {
    const store = createStore();
    const parent = store.getKampakuAgent();

    const created = store.createSubAgent({
      slug: "pr-reviewer",
      name: "PR Reviewer",
      responsibilities: "Review pull requests",
      systemPrompt: "You review PRs.",
      parentId: parent.id,
    });

    expect(created.slug).toBe("pr-reviewer");
    expect(store.listAllAgents()).toHaveLength(2);

    const tree = store.buildTree();
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.agent.slug).toBe("pr-reviewer");

    store.deleteAgent("pr-reviewer");
    expect(store.listGeneratedAgents()).toHaveLength(0);
  });

  it("rejects reserved and duplicate slugs", () => {
    const store = createStore();
    const parent = store.getKampakuAgent();

    expect(() =>
      store.createSubAgent({
        slug: "kampaku",
        name: "Bad",
        responsibilities: "x",
        systemPrompt: "x",
        parentId: parent.id,
      }),
    ).toThrow(AgentStoreError);

    store.createSubAgent({
      slug: "dup",
      name: "Dup",
      responsibilities: "x",
      systemPrompt: "x",
      parentId: parent.id,
    });

    expect(() =>
      store.createSubAgent({
        slug: "dup",
        name: "Dup 2",
        responsibilities: "x",
        systemPrompt: "x",
        parentId: parent.id,
      }),
    ).toThrow(AgentStoreError);
  });

  it("creates nested sub-agents under a parent slug", () => {
    const store = createStore();
    const parent = store.getKampakuAgent();

    store.createSubAgent({
      slug: "engineering",
      name: "Engineering",
      responsibilities: "Engineering org",
      systemPrompt: "Lead engineering.",
      parentId: parent.id,
    });

    const child = store.createSubAgent({
      slug: "pr-reviewer",
      name: "PR Reviewer",
      responsibilities: "Review pull requests",
      systemPrompt: "Review PRs.",
      parentId: store.getAgentBySlugOrId("engineering")!.id,
    });

    expect(child.parentId).toBe(store.getAgentBySlugOrId("engineering")?.id);
    const tree = store.buildTree();
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.agent.slug).toBe("engineering");
    expect(tree[0]?.children[0]?.children[0]?.agent.slug).toBe("pr-reviewer");
  });

  it("forbids deleting builtin and agents with children", () => {
    const store = createStore();
    const parent = store.getKampakuAgent();

    expect(() => store.deleteAgent("kampaku")).toThrow(AgentStoreError);

    const child = store.createSubAgent({
      slug: "parent-agent",
      name: "Parent",
      responsibilities: "parent",
      systemPrompt: "parent",
      parentId: parent.id,
    });

    store.createSubAgent({
      slug: "child-agent",
      name: "Child",
      responsibilities: "child",
      systemPrompt: "child",
      parentId: child.id,
    });

    expect(() => store.deleteAgent("parent-agent")).toThrow(AgentStoreError);
  });

  it("updates agent fields and parent", () => {
    const store = createStore();
    const root = store.getKampakuAgent();
    const team = store.createSubAgent({
      slug: "team-a",
      name: "Team A",
      responsibilities: "Team A",
      systemPrompt: "Team A",
      parentId: root.id,
    });

    const updated = store.updateAgent("team-a", {
      name: "Team Alpha",
      responsibilities: "Alpha team",
    });
    expect(updated.name).toBe("Team Alpha");

    const sibling = store.createSubAgent({
      slug: "team-b",
      name: "Team B",
      responsibilities: "Team B",
      systemPrompt: "Team B",
      parentId: root.id,
    });

    const leaf = store.createSubAgent({
      slug: "worker",
      name: "Worker",
      responsibilities: "Work",
      systemPrompt: "Work",
      parentId: team.id,
    });

    store.updateAgent("worker", { parentId: sibling.id });
    expect(store.getAgentBySlugOrId("worker")?.parentId).toBe(sibling.id);
  });
});

describe("stub-agent", () => {
  it("parses sub-agent creation requests", () => {
    const parsed = parseSubAgentRequest(
      "create a sub-agent named pr-reviewer that reviews pull requests",
    );
    expect(parsed).toEqual({
      slug: "pr-reviewer",
      name: "Pr Reviewer",
      responsibilities: "reviews pull requests",
    });
  });

  it("detects list agents requests", () => {
    expect(isListAgentsRequest("list agents")).toBe(true);
    expect(isListAgentsRequest("hola")).toBe(false);
  });

  it("builds deterministic system prompts", () => {
    const prompt = buildStubSystemPrompt("PR Reviewer", "Review pull requests");
    expect(prompt).toContain("PR Reviewer");
    expect(prompt).toContain("Review pull requests");
  });
});

describe("kampaku chat runtime", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createContext(): {
    ctx: KampakuToolContext;
    config: ReturnType<typeof loadConfig>;
    store: AgentStore;
    skillStore: SkillStore;
  } {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-agent-runtime-"));
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
    const memoryStore = new MemoryStore(db);
    const ctx: KampakuToolContext = { store, agentStore, conversationStore, pmStore, skillStore, memoryStore, config };
    return { ctx, config, store: agentStore, skillStore };
  }

  it("does not create a sub-agent from advisor chat in stub mode", async () => {
    const { ctx, config, store } = createContext();

    const response = await runKampakuChat(
      ctx,
      config,
      "create a sub-agent named pr-reviewer that reviews pull requests",
    );

    expect(response.toolsUsed).not.toContain("create_sub_agent");
    expect(response.reply).toContain("cannot create sub-agents directly");
    expect(store.getAgentBySlugOrId("pr-reviewer")).toBeUndefined();
  });

  it("routes project planning to the responsible lead in stub mode", async () => {
    const { ctx, config } = createContext();

    const response = await runKampakuChat(
      ctx,
      config,
      "Create a project called Demo App with roadmap and login and API tasks",
    );

    expect(response.toolsUsed).not.toContain("submit_intent");
    expect(response.reply).toContain("responsible project lead");
  });

  it("create_sub_agent tool validates through store", () => {
    const { store, skillStore } = createContext();

    const result = executeCreateSubAgent(store, skillStore, {
      slug: "docs-writer",
      name: "Docs Writer",
      responsibilities: "Write docs",
      system_prompt: buildStubSystemPrompt("Docs Writer", "Write docs"),
    });

    expect(result.slug).toBe("docs-writer");
  });

  it("creates sub-agents under a parent slug", () => {
    const { store, skillStore } = createContext();
    const parent = store.createSubAgent({
      slug: "engineering",
      name: "Engineering",
      responsibilities: "Engineering",
      systemPrompt: "Engineering",
      parentId: store.getKampakuAgent().id,
    });

    const result = executeCreateSubAgent(store, skillStore, {
      slug: "pr-reviewer",
      name: "PR Reviewer",
      responsibilities: "Review PRs",
      system_prompt: "Review PRs.",
      parent_slug: "engineering",
    });

    expect(result.slug).toBe("pr-reviewer");
    expect(store.getAgentBySlugOrId("pr-reviewer")?.parentId).toBe(parent.id);
  });

  it("returns stub agentUsed in stub mode", async () => {
    const { ctx, config } = createContext();

    const response = await runKampakuChat(ctx, config, "hola");

    expect(response.agentUsed).toBe("stub");
    expect(response.conversationId).toBeTruthy();
  });

  it("persists chat history across turns", async () => {
    const { ctx, config } = createContext();

    const first = await runKampakuChat(ctx, config, "hola");
    const second = await runKampakuChat(ctx, config, {
      message: "otra cosa",
      conversationId: first.conversationId,
    });

    expect(second.conversationId).toBe(first.conversationId);
    const messages = ctx.conversationStore.getMessages(first.conversationId);
    expect(messages.filter((message) => message.role === "user")).toHaveLength(2);
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(2);
  });
});

describe("kampaku chat llm runtime", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function createLlmContext(): {
    ctx: KampakuToolContext;
    config: ReturnType<typeof loadConfig>;
    store: AgentStore;
    skillStore: SkillStore;
  } {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-agent-llm-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "llm",
      freellmapiBaseUrl: "http://localhost:3001/v1",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const ctx: KampakuToolContext = { store, agentStore, conversationStore, pmStore, skillStore, memoryStore, config };
    return { ctx, config, store: agentStore, skillStore };
  }

  it("rejects sub-agent creation through Kampaku LLM chat", async () => {
    const { ctx, config, store } = createLlmContext();
    mockBroker.chatWithTools
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "create_sub_agent",
                    arguments: JSON.stringify({
                      slug: "pr-reviewer",
                      name: "PR Reviewer",
                      responsibilities: "Review pull requests",
                      system_prompt: "You review PRs.",
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [
          {
            message: {
              content: "Sub-agent pr-reviewer created.",
              tool_calls: undefined,
            },
          },
        ],
      });

    const response = await runKampakuChat(
      ctx,
      config,
      "create a sub-agent pr-reviewer to review PRs",
    );

    expect(response.agentUsed).toBe("llm");
    expect(response.model).toBe("test-model");
    expect(response.toolsUsed).toContain("create_sub_agent");
    expect(response.reply).toContain("pr-reviewer");
    expect(response.conversationId).toBeTruthy();
    expect(store.getAgentBySlugOrId("pr-reviewer")).toBeUndefined();
    expect(mockBroker.chatWithTools).toHaveBeenCalledTimes(2);
  });

  it("fires onProgress during LLM tool calls", async () => {
    const { ctx, config } = createLlmContext();
    const progress: string[] = [];
    mockBroker.chatWithTools
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "list_agents",
                    arguments: "{}",
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [{ message: { content: "Here are the agents.", tool_calls: undefined } }],
      });

    await runKampakuChat(ctx, config, "list agents", {
      onProgress: (event) => {
        if (event.phase === "tool") progress.push(event.tool);
        else progress.push(event.phase);
      },
    });

    expect(progress).toContain("thinking");
    expect(progress).toContain("list_agents");
    expect(progress).toContain("composing");
  });

  it("returns broker errors as reply instead of throwing", async () => {
    const { ctx, config } = createLlmContext();
    mockBroker.chatWithTools.mockRejectedValue(new Error("connection refused"));

    const response = await runKampakuChat(ctx, config, "hola");

    expect(response.agentUsed).toBe("llm");
    expect(response.reply).toContain("Failed to contact the AI provider");
  });

  it("passes tool errors back to the model", async () => {
    const { ctx, config, store } = createLlmContext();
    const parent = store.getKampakuAgent();
    store.createSubAgent({
      slug: "dup",
      name: "Dup",
      responsibilities: "x",
      systemPrompt: "x",
      parentId: parent.id,
    });

    mockBroker.chatWithTools
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "create_sub_agent",
                    arguments: JSON.stringify({
                      slug: "dup",
                      name: "Dup 2",
                      responsibilities: "x",
                      system_prompt: "x",
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [
          {
            message: {
              content: "The dup slug already exists.",
              tool_calls: undefined,
            },
          },
        ],
      });

    const response = await runKampakuChat(ctx, config, "create another dup");

    expect(response.reply).toContain("dup");
    const secondCallMessages = mockBroker.chatWithTools.mock.calls[1]?.[0];
    const toolMessage = secondCallMessages?.find((msg: { role: string }) => msg.role === "tool");
    expect(toolMessage?.content).toContain('"ok":false');
  });

  it("synthesizes a final reply when the tool iteration limit is reached", async () => {
    const { ctx, config } = createLlmContext();
    const toolOnlyResponse = {
      model: "test-model",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-loop",
                type: "function",
                function: {
                  name: "list_agents",
                  arguments: "{}",
                },
              },
            ],
          },
        },
      ],
    };

    mockBroker.chatWithTools.mockResolvedValue(toolOnlyResponse);
    mockBroker.complete.mockResolvedValue({
      content: "I set up the agents you asked for.",
      model: "test-model",
    });

    const response = await runKampakuChat(ctx, config, "organize my agents");

    expect(response.reply).toBe("I set up the agents you asked for.");
    expect(mockBroker.complete).toHaveBeenCalledOnce();
    expect(mockBroker.chatWithTools).toHaveBeenCalledTimes(10);
  });

  it("loads prior messages into the LLM request", async () => {
    const { ctx, config } = createLlmContext();

    mockBroker.chatWithTools.mockResolvedValueOnce({
      model: "test-model",
      choices: [{ message: { content: "Got it.", tool_calls: undefined } }],
    });
    const first = await runKampakuChat(ctx, config, "remember this: alpha");

    mockBroker.chatWithTools.mockResolvedValueOnce({
      model: "test-model",
      choices: [{ message: { content: "Alpha.", tool_calls: undefined } }],
    });
    await runKampakuChat(ctx, config, {
      message: "what did I say?",
      conversationId: first.conversationId,
    });

    const secondCallMessages = mockBroker.chatWithTools.mock.calls[1]?.[0];
    expect(secondCallMessages?.some((msg: { content: string }) => msg.content === "remember this: alpha")).toBe(true);
    expect(secondCallMessages?.some((msg: { content: string }) => msg.content === "what did I say?")).toBe(true);
  });
});
