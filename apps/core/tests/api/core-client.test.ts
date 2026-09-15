import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { CoreClient } from "../../src/client/core-client.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

describe("CoreClient", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestClient() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-client-test-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      plannerMode: "stub",
      agentMode: "stub",
      coreUrl: "http://test",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    bootstrapProject(store, config);
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore);

    const fetchFn: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const path = url.replace("http://test", "");
      return app.request(path, init);
    };

    const client = new CoreClient({ baseUrl: "http://test", fetch: fetchFn });
    return { client, config, store };
  }

  it("returns false when core is unreachable", async () => {
    const client = new CoreClient({ baseUrl: "http://127.0.0.1:1" });
    await expect(client.health()).resolves.toBe(false);
  });

  it("checks health", async () => {
    const { client } = createTestClient();
    await expect(client.health()).resolves.toBe(true);
  });

  it("returns the default project", async () => {
    const { client } = createTestClient();
    const project = await client.getDefaultProject();
    expect(project?.name).toBe("Kampaku");
  });

  it("creates a goal and fetches its audit trail", async () => {
    const { client } = createTestClient();
    const project = await client.getDefaultProject();

    const goal = await client.createGoal({
      projectId: project!.id,
      objective: "Client test objective",
      repositoryRole: "core",
    });

    const audit = await client.getGoalAudit(goal.id);
    expect(audit.goal.id).toBe(goal.id);
    expect(audit.tasks).toHaveLength(1);
  });

  it("lists goals with limit", async () => {
    const { client } = createTestClient();
    const project = await client.getDefaultProject();

    await client.createGoal({
      projectId: project!.id,
      objective: "One",
      repositoryRole: "core",
    });
    await client.createGoal({
      projectId: project!.id,
      objective: "Two",
      repositoryRole: "core",
    });

    const goals = await client.listGoals({ limit: 1 });
    expect(goals).toHaveLength(1);
    expect(goals[0]?.objective).toBe("Two");
  });

  it("persists agent creation requested through orchestrator chat", async () => {
    const { client } = createTestClient();

    const response = await client.chatWithKampaku(
      "create a sub-agent named pr-reviewer that reviews pull requests",
    );
    expect(response.reply).toContain("pr-reviewer");
    expect(response.conversationId).toBeTruthy();

    const followUp = await client.chatWithKampaku("list agents", {
      conversationId: response.conversationId,
    });
    expect(followUp.conversationId).toBe(response.conversationId);

    const { tree } = await client.listAgents({ tree: true });
    expect(tree?.[0]?.children ?? []).toHaveLength(1);
    expect(tree?.[0]?.children?.[0]?.agent.slug).toBe("pr-reviewer");
  });

  it("performs skills CRUD via CoreClient", async () => {
    const { client, config } = createTestClient();

    const created = await client.createSkill({
      slug: "client-skill",
      name: "Client Skill",
      description: "From client",
      capabilities: ["code.agent"],
      tools: ["code-agent"],
      prompt_fragment: "Client fragment",
    });
    expect(created.slug).toBe("client-skill");

    const fetched = await client.getSkill("client-skill");
    expect(fetched.name).toBe("Client Skill");

    const updated = await client.updateSkill("client-skill", {
      description: "Updated",
    });
    expect(updated.description).toBe("Updated");

    const { skills } = await client.listSkills();
    expect(skills.some((skill) => skill.slug === "client-skill")).toBe(true);

    await client.deleteSkill("client-skill");
    const { readSkillFromCatalog } = await import("../../src/persistence/skill-catalog.js");
    expect(readSkillFromCatalog(config.workspaceRoot, "client-skill")).toBeUndefined();
  });
});
