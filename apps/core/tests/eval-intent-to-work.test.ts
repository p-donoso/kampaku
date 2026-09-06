import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runKampakuChat } from "../src/agents/runtime/session.js";
import { type KampakuToolContext } from "../src/agents/runtime/tools/index.js";
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

const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Automated coverage for docs/eval/05-intent-to-work.md.
 */
describe("eval suite 05 intent to work", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-intent-to-work-"));
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

  function countAllWorkItems(store: Store, pmStore: PmStore): number {
    return store.listProjects().reduce(
      (sum, project) => sum + pmStore.listWorkItemsByProject(project.id).length,
      0,
    );
  }

  it("vague improve asks next-intent options before creating work", async () => {
    const { ctx, config, store, agentStore, pmStore, questionStore } = createFreshInstance();
    const beforeWork = countAllWorkItems(store, pmStore);
    const beforeAgents = agentStore.listAllAgents().length;

    const response = await runKampakuChat(
      ctx,
      config,
      "Improve the project. Make it better. Start now.",
    );

    expect(response.toolsUsed).toEqual(expect.arrayContaining(["list_projects"]));
    expect(response.toolsUsed).not.toContain("submit_intent");
    expect(response.toolsUsed).not.toContain("staff_project_team");
    expect(response.reply).toContain("Clarify before planning");
    expect(response.reply).toContain("intent-next-focus");
    expect(response.reply).toMatch(/no repo|missing foundation|Quality and reliability/i);
    expect(response.reply).not.toMatch(/created \d+ work|work items created|board flooded/i);
    expect(questionStore.listPending().length).toBeGreaterThan(0);
    expect(countAllWorkItems(store, pmStore)).toBe(beforeWork);
    expect(agentStore.listAllAgents()).toHaveLength(beforeAgents);
  });

  it("emperor clarify-first follow-up still does not flood the board", async () => {
    const { ctx, config, store, pmStore, questionStore } = createFreshInstance();
    await runKampakuChat(ctx, config, "Improve the project. Make it better. Start now.");
    const beforeWork = countAllWorkItems(store, pmStore);
    const beforePending = questionStore.listPending().length;

    const followUp = await runKampakuChat(
      ctx,
      config,
      "Clarify first; do not create more than one proposal track until I confirm.",
    );

    expect(followUp.toolsUsed ?? []).not.toContain("submit_intent");
    expect(countAllWorkItems(store, pmStore)).toBe(beforeWork);
    expect(questionStore.listPending().length).toBeGreaterThanOrEqual(beforePending);
  });

  it("healthy-default first-run decide asks next intent instead of inventing foundation", async () => {
    const { ctx, config, store, pmStore, questionStore } = createFreshInstance();
    const beforeWork = countAllWorkItems(store, pmStore);

    const decide = await runKampakuChat(
      ctx,
      config,
      "If something is missing for a first run, tell me what I must decide. Do not create it yet.",
    );

    expect(decide.toolsUsed).toEqual(expect.arrayContaining(["list_projects", "list_agents"]));
    expect(decide.reply).toContain("intent-next-focus");
    expect(decide.reply).not.toMatch(/six-role|repository URL/i);
    expect(decide.reply).toMatch(/already exists|missing foundation|next/i);
    expect(questionStore.listPending().length).toBeGreaterThan(0);
    expect(countAllWorkItems(store, pmStore)).toBe(beforeWork);
  });
});
