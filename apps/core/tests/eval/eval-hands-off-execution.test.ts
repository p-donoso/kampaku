import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runKampakuChat } from "../../src/agents/runtime/session.js";
import { executeToolCall, type KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { createDb } from "../../src/persistence/db.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Automated coverage for docs/eval/08-hands-off-execution.md.
 */
describe("eval suite 08 hands-off execution", () => {
  let dataDir: string;
  let strangerPath: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (strangerPath) rmSync(strangerPath, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-exec-"));
    strangerPath = join(tmpdir(), `kampaku-eval-exec-stranger-${Date.now()}`);
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

  async function bootstrapAndPlan(ctx: KampakuToolContext, agentStore: AgentStore) {
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
    await executeToolCall(
      ctx,
      "propose_project_plan",
      JSON.stringify({
        project_slug_or_id: "eval-stranger",
        intent: "Plan a tiny Hello Eval web page with exact checks; wait for go.",
      }),
      { agentId: kampaku.id },
    );
  }

  it("execute_approved_plan runs stranger checks, writes index.html, and exposes job", async () => {
    const { app, ctx, store, agentStore, pmStore } = createFreshInstance();
    await bootstrapAndPlan(ctx, agentStore);
    const kampaku = agentStore.getKampakuAgent();
    const project = store.getProjectBySlug("eval-stranger")!;

    const beforeHost = execFileSync("git", ["status", "--porcelain"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });

    const result = await executeToolCall(
      ctx,
      "execute_approved_plan",
      JSON.stringify({ project_slug_or_id: project.slug }),
      { agentId: kampaku.id },
    );
    const output = result.output as {
      jobId: string;
      jobStatus: string;
      leavesCompleted: number;
      repositoryPath: string;
    };

    expect(output.jobId).toBeTruthy();
    expect(output.jobStatus).toBe("succeeded");
    expect(output.leavesCompleted).toBeGreaterThanOrEqual(3);
    expect(output.repositoryPath).toBe(strangerPath);

    const indexHtml = readFileSync(join(strangerPath, "index.html"), "utf8");
    expect(indexHtml).toContain("Hello Eval");
    expect(execFileSync("node", ["hello.js"], { cwd: strangerPath, encoding: "utf8" }).trim()).toBe(
      "Hello Eval",
    );

    const items = pmStore.listWorkItemsByProject(project.id);
    const leaves = items.filter((item) => item.parentId);
    expect(leaves.every((item) => item.status === "done")).toBe(true);

    const listRes = await app.request(`/api/v1/jobs?project=${project.slug}`);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      jobs: Array<{ id: string; status: string }>;
    };
    expect(listBody.jobs.some((job) => job.id === output.jobId && job.status === "succeeded")).toBe(
      true,
    );

    const detailRes = await app.request(`/api/v1/jobs/${output.jobId}`);
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      status: string;
      logs: Array<{ line: string }>;
    };
    expect(detail.status).toBe("succeeded");
    expect(detail.logs.some((entry) => /Approved plan execution started/i.test(entry.line))).toBe(true);
    expect(detail.logs.some((entry) => /Leaf done/i.test(entry.line))).toBe(true);

    await expect(
      executeToolCall(
        ctx,
        "execute_approved_plan",
        JSON.stringify({ project_slug_or_id: "kampaku" }),
        { agentId: kampaku.id },
      ),
    ).rejects.toThrow(/platform project/i);

    const afterHost = execFileSync("git", ["status", "--porcelain"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });
    expect(afterHost).toBe(beforeHost);
    expect(existsSync(join(WORKSPACE_ROOT, "index.html"))).toBe(false);
  });

  it("stub chat executes approved Hello Eval and refuses vague start-now without plan go", async () => {
    const { ctx, config, store, agentStore, pmStore } = createFreshInstance();
    await bootstrapAndPlan(ctx, agentStore);
    const project = store.getProjectBySlug("eval-stranger")!;

    const vague = await runKampakuChat(ctx, config, "Start now. Make it better.");
    expect(vague.toolsUsed).not.toContain("execute_approved_plan");
    expect(pmStore.listWorkItemsByProject(project.id).every((item) => item.status === "todo")).toBe(
      true,
    );

    const response = await runKampakuChat(
      ctx,
      config,
      "Execute the approved Hello Eval plan on the stranger project only. Show progress. Stop and ask if you hit a wall.",
    );
    expect(response.toolsUsed).toEqual(
      expect.arrayContaining(["list_projects", "execute_approved_plan"]),
    );
    expect(response.reply).toContain("Hello Eval execution complete");
    expect(response.reply).toMatch(/job/i);
    expect(readFileSync(join(strangerPath, "index.html"), "utf8")).toContain("Hello Eval");
  });

  it.runIf(process.env.KAMPAKU_EVAL_LLM_SMOKE === "1")(
    "LLM smoke: go-ahead uses execute_approved_plan (not hello-eval fixture)",
    { timeout: 180_000 },
    async () => {
      dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-exec-llm-"));
      strangerPath = join(tmpdir(), `kampaku-eval-exec-llm-stranger-${Date.now()}`);
      const config = loadConfig({
        dataDir,
        dbPath: join(dataDir, "kampaku.db"),
        workspaceRoot: WORKSPACE_ROOT,
        agentMode: "llm",
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
      expect(config.agentMode).toBe("llm");
      await bootstrapAndPlan(ctx, agentStore);

      const response = await runKampakuChat(
        ctx,
        config,
        "Execute the approved Hello Eval plan on the stranger project only. Show progress. Stop and ask if you hit a wall. Do not touch the Kampaku monorepo.",
      );
      expect(response.agentUsed).not.toBe("stub");
      expect(response.toolsUsed ?? []).toContain("execute_approved_plan");
      expect(response.toolsUsed ?? []).not.toContain("execute_hello_eval_plan");
      expect(existsSync(join(strangerPath, "index.html"))).toBe(true);
    },
  );
});
