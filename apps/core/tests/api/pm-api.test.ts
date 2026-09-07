import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

describe("pm api", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-pm-api-"));
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
    bootstrapProject(store, config);
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore);
    return { app, store };
  }

  it("POST /api/v1/intents creates a project plan", async () => {
    const { app } = createTestApp();

    const res = await app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Create project Demo App with roadmap and login and API tasks",
        projectSlug: "demo-app",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { projectSlug: string; workItemsCreated: number };
    expect(body.projectSlug).toBe("demo-app");
    expect(body.workItemsCreated).toBeGreaterThan(0);
  });

  it("GET /api/v1/projects/:slug returns overview", async () => {
    const { app } = createTestApp();

    await app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Create project Overview Test with tasks",
        projectSlug: "overview-test",
      }),
    });

    const res = await app.request("/api/v1/projects/overview-test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { slug: string }; workItems: unknown[] };
    expect(body.project.slug).toBe("overview-test");
    expect(body.workItems.length).toBeGreaterThan(0);
  });

  it("GET /api/v1/agents/kampaku/dashboard returns status", async () => {
    const { app } = createTestApp();

    await app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Create project Dash Test with testing tasks",
        projectSlug: "dash-test",
      }),
    });

    const res = await app.request("/api/v1/agents/kampaku/dashboard");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agentSlug: string; total: number };
    expect(body.agentSlug).toBe("kampaku");
    expect(body.total).toBeGreaterThan(0);
  });
});
