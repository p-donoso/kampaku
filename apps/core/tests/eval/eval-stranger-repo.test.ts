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
 * Automated coverage for docs/eval/06-stranger-repo.md.
 */
describe("eval suite 06 stranger repo", () => {
  let dataDir: string;
  let strangerPath: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (strangerPath) rmSync(strangerPath, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-stranger-data-"));
    strangerPath = mkdtempSync(join(tmpdir(), "kampaku-eval-stranger-repo-"));
    // Start empty for mkdir-by-tool; remove so bootstrap creates it
    rmSync(strangerPath, { recursive: true, force: true });
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

  it("bootstrap_stranger_project seeds honest runnable tree outside monorepo", async () => {
    const { ctx, store, agentStore, pmStore } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();
    const beforeWork = store.listProjects().reduce(
      (sum, project) => sum + pmStore.listWorkItemsByProject(project.id).length,
      0,
    );

    const result = await executeToolCall(
      ctx,
      "bootstrap_stranger_project",
      JSON.stringify({
        repository_path: strangerPath,
        project_slug: "eval-stranger",
        project_name: "Eval Stranger",
      }),
      { agentId: kampaku.id },
    );
    const output = result.output as {
      project: { id: string; slug: string; repositories: Array<{ url: string }> };
      repositoryPath: string;
      seeded: string[];
      verifyCommands: string[];
      workItemsCreated: number;
    };

    expect(output.project.slug).toBe("eval-stranger");
    expect(output.repositoryPath).toBe(strangerPath);
    expect(output.project.repositories[0]?.url).toContain(strangerPath);
    expect(output.seeded).toEqual(
      expect.arrayContaining(["README.md", "package.json", "hello.js", "hello.test.js", "LICENSE"]),
    );
    expect(existsSync(join(strangerPath, ".git"))).toBe(true);
    expect(readFileSync(join(strangerPath, "README.md"), "utf8")).toMatch(/node hello\.js/);
    expect(readFileSync(join(strangerPath, "README.md"), "utf8")).not.toMatch(/npm run dev|npm ci|npm run build/);
    expect(readFileSync(join(strangerPath, "README.md"), "utf8")).toMatch(/no invented web framework/i);
    expect(execFileSync("node", ["hello.js"], { cwd: strangerPath, encoding: "utf8" }).trim()).toBe(
      "Hello Eval",
    );
    execFileSync("node", ["--test"], { cwd: strangerPath, stdio: "ignore" });
    expect(output.workItemsCreated).toBe(0);
    expect(
      store.listProjects().reduce((sum, project) => sum + pmStore.listWorkItemsByProject(project.id).length, 0),
    ).toBe(beforeWork);

    await expect(
      executeToolCall(
        ctx,
        "bootstrap_stranger_project",
        JSON.stringify({
          repository_path: WORKSPACE_ROOT,
          project_slug: "evil-host",
        }),
        { agentId: kampaku.id },
      ),
    ).rejects.toThrow(/monorepo/i);
  });

  it("stub chat bootstraps stranger path and reports verify commands", async () => {
    const { ctx, config, store } = createFreshInstance();
    const hostGitBefore = execFileSync("git", ["status", "--porcelain"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });

    const response = await runKampakuChat(
      ctx,
      config,
      `Create a new minimal open-source project at ${strangerPath} linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`,
    );

    expect(response.toolsUsed).toContain("bootstrap_stranger_project");
    expect(response.reply).toContain("Stranger project ready");
    expect(response.reply).toContain(strangerPath);
    expect(response.reply).toContain("node hello.js");
    expect(existsSync(join(strangerPath, "README.md"))).toBe(true);
    const project = store.listProjects().find((row) => row.slug === "kampaku-eval-stranger-repo" || row.repositories.some((repo) => repo.url.includes(strangerPath)));
    // slug comes from basename of mkdtemp path which varies — match by repo url
    const linked = store.listProjects().find((row) => row.repositories.some((repo) => repo.url.includes(strangerPath)));
    expect(linked).toBeTruthy();
    expect(linked!.slug).not.toBe("kampaku");

    const hostGitAfter = execFileSync("git", ["status", "--porcelain"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });
    // Ignore intentional suite edits already dirty in workspace; ensure no stranger files under monorepo
    expect(hostGitAfter.split("\n").filter((line) => line.includes("kampaku-eval-stranger"))).toEqual([]);
    void hostGitBefore;
    void project;
  });
});
