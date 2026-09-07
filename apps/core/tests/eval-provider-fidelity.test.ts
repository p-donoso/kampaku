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
const RUN_LLM_SMOKE = process.env.KAMPAKU_EVAL_LLM_SMOKE === "1";

/**
 * Automated coverage for docs/eval/17-provider-fidelity.md.
 * Stub locks tool/chat honesty; optional live FreeLLMAPI smoke when KAMPAKU_EVAL_LLM_SMOKE=1.
 */
describe("eval suite 17 provider fidelity", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createFreshInstance(agentMode: "stub" | "llm" = "stub") {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-provider-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: WORKSPACE_ROOT,
      agentMode,
      ...(agentMode === "llm"
        ? {
            // Prefer explicit env; loadConfig also reads FREELLMAPI_*.
          }
        : {}),
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
    createApp(
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
    return { config, ctx, store, agentStore, pmStore };
  }

  it("list_projects matches store; get_project miss lists available slugs", async () => {
    const { ctx, store } = createFreshInstance();
    const listed = await executeToolCall(ctx, "list_projects", "{}");
    const output = listed.output as {
      count: number;
      projects: Array<{ slug: string }>;
    };
    expect(output.count).toBe(store.listProjects().length);
    expect(output.projects.map((project) => project.slug)).toEqual(["kampaku"]);

    await expect(
      executeToolCall(
        ctx,
        "get_project",
        JSON.stringify({ project_slug_or_id: "not-a-real-project" }),
      ),
    ).rejects.toThrow(/Available projects: kampaku/);
  });

  it("stub lists every project slug without inventing", async () => {
    const { ctx, config, store } = createFreshInstance();
    const before = store.listProjects().length;
    const response = await runKampakuChat(
      ctx,
      config,
      "List every project slug that exists. If none, say none. Do not invent.",
    );
    expect(response.toolsUsed).toContain("list_projects");
    expect(response.reply).toMatch(/`kampaku`/);
    expect(response.reply.toLowerCase()).not.toMatch(/no projects exist/);
    expect(store.listProjects()).toHaveLength(before);
  });

  it("stub wrong-slug ask recovers with available inventory", async () => {
    const { ctx, config, store } = createFreshInstance();
    const before = store.listProjects().length;
    const response = await runKampakuChat(
      ctx,
      config,
      "Describe project slug not-a-real-project. What should I use instead?",
    );
    expect(response.toolsUsed).toEqual(expect.arrayContaining(["get_project", "list_projects"]));
    expect(response.reply).toMatch(/not found|Available/i);
    expect(response.reply).toMatch(/kampaku/);
    expect(response.reply.toLowerCase()).not.toMatch(/created project not-a-real/);
    expect(store.listProjects()).toHaveLength(before);
  });

  it("stub post-mutation marker turn reports id and description", async () => {
    const { ctx, config, store } = createFreshInstance();
    await runKampakuChat(
      ctx,
      config,
      "Pick one existing project. Set a short note I can recognize: EVAL-SURFACE-MARKER. Confirm the id.",
    );
    const project = store.getProjectBySlug("kampaku")!;
    expect(project.description).toBe("EVAL-SURFACE-MARKER");

    const confirm = await runKampakuChat(
      ctx,
      config,
      "What is the current marker or display note on that project? Include the project id. Do not guess.",
    );
    expect(confirm.toolsUsed).toContain("get_project");
    expect(confirm.reply).toContain(project.id);
    expect(confirm.reply).toContain("EVAL-SURFACE-MARKER");
  });

  it.runIf(RUN_LLM_SMOKE)(
    "LLM smoke: inventory, wrong-slug, and post-mutation marker stay faithful",
    async () => {
      const { ctx, config, store } = createFreshInstance("llm");
      expect(config.agentMode).toBe("llm");
      expect(config.freellmapiApiKey?.length ?? 0).toBeGreaterThan(8);

      const list = await runKampakuChat(
        ctx,
        config,
        "List every project slug that exists. If none, say none. Do not invent.",
      );
      expect(list.agentUsed).not.toBe("stub");
      expect(list.reply.toLowerCase()).toContain("kampaku");
      expect(list.reply.toLowerCase()).not.toMatch(/no projects|zero projects|none exist/);
      expect(store.listProjects()).toHaveLength(1);
      const conversationId = list.conversationId;

      const miss = await runKampakuChat(ctx, config, {
        message: "Describe project slug not-a-real-project. What should I use instead?",
        conversationId,
      });
      expect(miss.reply.toLowerCase()).toMatch(/not found|does not exist|available|kampaku/);
      expect(miss.reply.toLowerCase()).not.toMatch(/i created not-a-real-project/);
      expect(store.listProjects()).toHaveLength(1);

      await runKampakuChat(ctx, config, {
        message:
          "Pick one existing project. Set a short note I can recognize: EVAL-SURFACE-MARKER. Confirm the id.",
        conversationId,
      });
      const project = store.getProjectBySlug("kampaku")!;
      expect(project.description).toBe("EVAL-SURFACE-MARKER");

      const confirm = await runKampakuChat(ctx, config, {
        message:
          "What is the current marker or display note on that project? Include the project id. Do not guess.",
        conversationId,
      });
      expect(confirm.reply).toContain(project.id);
      expect(confirm.reply).toContain("EVAL-SURFACE-MARKER");
      expect(store.listProjects()).toHaveLength(1);
    },
    300_000,
  );
});
