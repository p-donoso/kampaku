import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/api/app.js";
import { bootstrapProject } from "../src/application/projects.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { MemoryStore } from "../src/persistence/memory-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { Store } from "../src/persistence/store.js";
import type { AgentRosterNode } from "../src/application/agents-roster.js";

describe("agents roster api", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-roster-api-"));
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
    bootstrapProject(store, config);
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      undefined,
      memoryStore,
    );
    return { app, agentStore, memoryStore };
  }

  function flatten(nodes: AgentRosterNode[]): AgentRosterNode[] {
    return nodes.flatMap((node) => [node, ...flatten(node.children)]);
  }

  it("GET /api/v1/agents/roster returns tree with workload metrics", async () => {
    const { app, agentStore, memoryStore } = createTestApp();
    const kampaku = agentStore.getKampakuAgent();

    agentStore.createSubAgent({
      slug: "roster-agent",
      name: "Roster Agent",
      responsibilities: "Test roster metrics",
      systemPrompt: "Test",
      parentId: kampaku.id,
    });

    await app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Create project Roster Test with tasks",
        projectSlug: "roster-test",
      }),
    });

    const rosterAgent = agentStore.getAgentBySlugOrId("roster-agent")!;
    memoryStore.create({
      agentId: rosterAgent.id,
      kind: "learning",
      title: "Test learning",
      body: "Learned something useful",
    });

    const res = await app.request("/api/v1/agents/roster");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { tree: AgentRosterNode[] };
    expect(body.tree.length).toBeGreaterThan(0);

    const flat = flatten(body.tree);
    expect(flat.some((node) => node.agent.slug === "kampaku")).toBe(false);
    expect(flat.some((node) => node.agent.slug === "roster-agent")).toBe(true);

    const entry = flat.find((node) => node.agent.slug === "roster-agent");
    expect(entry?.agent.memoryCounts.learnings).toBe(1);
  });
});
