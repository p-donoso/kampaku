import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runKampakuChat } from "../src/agents/runtime/session.js";
import { executeToolCall, type KampakuToolContext } from "../src/agents/runtime/tools/index.js";
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
 * Automated coverage for docs/eval/07-plan-a-human-can-run.md.
 */
describe("eval suite 07 plan a human can run", () => {
  let dataDir: string;
  let strangerPath: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (strangerPath) rmSync(strangerPath, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-plan-"));
    strangerPath = join(tmpdir(), `kampaku-eval-plan-stranger-${Date.now()}`);
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
    return { app, config, ctx, store, agentStore, pmStore };
  }

  async function bootstrapStranger(ctx: KampakuToolContext, agentStore: AgentStore) {
    const kampaku = agentStore.getKampakuAgent();
    await executeToolCall(
      ctx,
      "bootstrap_stranger_project",
      JSON.stringify({
        repository_path: strangerPath,
        project_slug: "eval-stranger",
        project_name: "Eval Stranger",
      }),
      { agentId: kampaku.id },
    );
  }

  it("propose_project_plan creates multi-leaf todos with honest node AC and no jobs", async () => {
    const { ctx, store, agentStore, pmStore } = createFreshInstance();
    await bootstrapStranger(ctx, agentStore);
    const kampaku = agentStore.getKampakuAgent();
    const project = store.getProjectBySlug("eval-stranger")!;

    const result = await executeToolCall(
      ctx,
      "propose_project_plan",
      JSON.stringify({
        project_slug_or_id: project.slug,
        intent: "Plan a tiny Hello Eval web page with exact checks; wait for go.",
      }),
      { agentId: kampaku.id },
    );
    const output = result.output as {
      leafCount: number;
      jobsStarted: number;
      workItems: Array<{ id: string; title: string; status: string }>;
    };

    expect(output.leafCount).toBeGreaterThanOrEqual(3);
    expect(output.jobsStarted).toBe(0);
    expect(output.workItems.every((item) => item.status === "todo")).toBe(true);

    const items = pmStore.listWorkItemsByProject(project.id);
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((item) => item.status === "todo")).toBe(true);
    const acBlob = items.flatMap((item) => item.acceptanceCriteria).join("\n");
    expect(acBlob).toMatch(/node hello\.js/);
    expect(acBlob).toMatch(/node --test/);
    expect(acBlob).not.toMatch(/npm run build|Express/);

    await expect(
      executeToolCall(
        ctx,
        "propose_project_plan",
        JSON.stringify({ project_slug_or_id: "kampaku", intent: "Hello Eval" }),
        { agentId: kampaku.id },
      ),
    ).rejects.toThrow(/platform project/i);
  });

  it("stub chat proposes Hello Eval plan with stable ids and wait-for-go", async () => {
    const { ctx, config, store, agentStore, pmStore } = createFreshInstance();
    await bootstrapStranger(ctx, agentStore);
    const project = store.getProjectBySlug("eval-stranger")!;

    const response = await runKampakuChat(
      ctx,
      config,
      "For the stranger project, plan a tiny web app: one page that shows Hello Eval, with install, run, and a basic test. Break the work into steps a human could follow without you. Include exact check commands. Do not mark anything done. Wait for my go before large execution.",
    );

    expect(response.toolsUsed).toEqual(
      expect.arrayContaining(["list_projects", "propose_project_plan"]),
    );
    expect(response.reply).toContain("Human-readable plan proposed");
    expect(response.reply).toMatch(/wait.*go|Waiting for your go/i);
    expect(response.reply).toContain("node hello.js");
    expect(response.reply).not.toMatch(/\bdone\b.*plan|marked done/i);

    const items = pmStore.listWorkItemsByProject(project.id);
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((item) => item.status === "todo")).toBe(true);
    const leaves = items.filter((item) => item.parentId);
    expect(leaves.length).toBeGreaterThanOrEqual(3);
    for (const item of leaves) {
      expect(response.reply).toContain(item.id);
    }
  });
});
