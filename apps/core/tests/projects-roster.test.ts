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
import { QuestionStore } from "../src/persistence/question-store.js";
import { BlockageStore } from "../src/persistence/blockage-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { Store } from "../src/persistence/store.js";
import type { ProjectRosterTreeNode } from "../src/application/projects-roster.js";

describe("projects roster api", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-projects-roster-"));
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
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    questionStore.setBlockageStore(blockageStore);
    blockageStore.setQuestionStore(questionStore);
    bootstrapProject(store, config);
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      memoryStore,
      blockageStore,
    );
    return { app };
  }

  it("GET /api/v1/projects/roster returns management metrics", async () => {
    const { app } = createTestApp();

    await app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Create project Roster PM with login tasks",
        projectSlug: "roster-pm",
      }),
    });

    const res = await app.request("/api/v1/projects/roster");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { projects: ProjectRosterTreeNode[] };
    const node = body.projects.find((p) => p.project.slug === "roster-pm");
    expect(node).toBeDefined();
    expect(node!.project.totalTasks).toBeGreaterThan(0);
    expect(node!.project.health).toBeDefined();
    expect(typeof node!.project.progressPct).toBe("number");
    expect(Array.isArray(node!.tasks)).toBe(true);
  });
});
