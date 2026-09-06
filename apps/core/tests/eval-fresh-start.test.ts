import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runKampakuChat } from "../src/agents/runtime/session.js";
import type { KampakuToolContext } from "../src/agents/runtime/tools/index.js";
import { createApp } from "../src/api/app.js";
import { bootstrapProject } from "../src/application/projects.js";
import { loadConfig } from "../src/config.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { createDb } from "../src/persistence/db.js";
import { MemoryStore } from "../src/persistence/memory-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { QuestionStore } from "../src/persistence/question-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { Store } from "../src/persistence/store.js";

/** Monorepo root — skill catalog + real workspace for empty-instance bootstrap. */
const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Automated coverage for docs/eval/01-fresh-start.md.
 * Advisor 10/10 requires tests like these; manual chat alone is not enough.
 */
describe("eval suite 01 fresh start", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-fresh-start-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: WORKSPACE_ROOT,
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
    bootstrapProject(store, config, db);
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      memoryStore,
    );
    const ctx: KampakuToolContext = {
      store,
      agentStore,
      conversationStore,
      pmStore,
      skillStore,
      memoryStore,
      questionStore,
      config,
    };
    return { app, config, ctx, store, agentStore, pmStore, questionStore };
  }

  it("boots an empty data dir with health, default project, and standing team", async () => {
    const { app, store, agentStore } = createFreshInstance();

    const health = await app.request("/health");
    expect(health.status).toBe(200);

    const projects = store.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.slug).toBe("kampaku");

    const manager = agentStore.getAgentBySlugOrId("kampaku-manager");
    expect(manager).toBeDefined();
    expect(projects[0]?.projectLeadAgentId).toBe(manager!.id);

    const specialists = ["kampaku-ux-ui", "kampaku-fullstack", "kampaku-qa", "kampaku-auditor"];
    for (const slug of specialists) {
      const agent = agentStore.getAgentBySlugOrId(slug);
      expect(agent, slug).toBeDefined();
      expect(agent!.parentId).toBe(manager!.id);
    }
  });

  it("serve-equivalent bootstrap seeds default project without a separate bootstrap command", () => {
    const { store, agentStore } = createFreshInstance();
    expect(store.listProjects().map((project) => project.slug)).toEqual(["kampaku"]);
    expect(agentStore.getAgentBySlugOrId("kampaku-manager")).toBeDefined();
  });

  it("inspect chat does not create projects, agents, or work items", async () => {
    const { ctx, config, store, agentStore, pmStore } = createFreshInstance();
    const projectId = store.listProjects()[0]!.id;
    const before = {
      projects: store.listProjects().length,
      agents: agentStore.listAllAgents().length,
      workItems: pmStore.listWorkItemsByProject(projectId).length,
    };

    const response = await runKampakuChat(
      ctx,
      config,
      "Are we ready? What exists here — projects, team, open work? Do not change anything.",
    );

    expect(response.toolsUsed).toEqual(expect.arrayContaining(["list_projects", "list_agents"]));
    expect(response.reply.toLowerCase()).toContain("kampaku");
    expect(response.toolsUsed).not.toContain("submit_intent");
    expect(response.toolsUsed).not.toContain("create_sub_agent");
    expect(store.listProjects()).toHaveLength(before.projects);
    expect(agentStore.listAllAgents()).toHaveLength(before.agents);
    expect(pmStore.listWorkItemsByProject(projectId)).toHaveLength(before.workItems);
  });

  it("list_projects returns the default project and get_project miss lists available slugs", async () => {
    const { ctx } = createFreshInstance();
    const { executeToolCall } = await import("../src/agents/runtime/tools/index.js");
    const listed = await executeToolCall(ctx, "list_projects", "{}");
    expect(listed.output).toMatchObject({
      count: 1,
      projects: [expect.objectContaining({ slug: "kampaku" })],
    });

    await expect(
      executeToolCall(ctx, "get_project", JSON.stringify({ project_slug_or_id: "missing" })),
    ).rejects.toThrow(/Available projects: kampaku/);
  });

  it("stub first-run decide prompt emits a pending emperor question without mutating work", async () => {
    const { ctx, config, store, agentStore, pmStore, questionStore } = createFreshInstance();
    const projectId = store.listProjects()[0]!.id;
    const beforeAgents = agentStore.listAllAgents().length;

    const decide = await runKampakuChat(
      ctx,
      config,
      "If something is missing for a first run, tell me what I must decide. Do not create it yet.",
    );

    expect(decide.reply).toContain("<kampaku-question>");
    expect(decide.reply).toContain("first-run-setup");
    expect(questionStore.listPending().length).toBeGreaterThan(0);
    expect(store.listProjects()).toHaveLength(1);
    expect(agentStore.listAllAgents()).toHaveLength(beforeAgents);
    expect(pmStore.listWorkItemsByProject(projectId)).toHaveLength(0);
  });
});
