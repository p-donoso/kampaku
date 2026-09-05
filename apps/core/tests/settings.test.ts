import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addAllowedFolder,
  bootstrapFilesystemSettings,
  getFilesystemSettings,
  isPathWithinFolder,
  removeAllowedFolder,
  updateAllowedFolder,
} from "../src/application/settings/filesystem.js";
import { createApp } from "../src/api/app.js";
import { bootstrapProject } from "../src/application/projects.js";
import { CoreClient } from "../src/client/core-client.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { Store } from "../src/persistence/store.js";
import { createGoalWithPlan } from "../src/scheduler/create-goal.js";
import { DEFAULT_GLOBAL_SYSTEM_PROMPT } from "../src/application/settings/global-system-prompt.js";

describe("filesystem settings", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestContext() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-settings-test-"));
    const workspaceRoot = join(dataDir, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });

    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot,
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

    return { store, config, client, workspaceRoot };
  }

  it("bootstraps home and workspace as default allowed folders", () => {
    const { store, workspaceRoot } = createTestContext();
    const settings = getFilesystemSettings(store);
    expect(settings.folders.length).toBeGreaterThanOrEqual(1);
    expect(settings.folders.some((folder) => folder.path === workspaceRoot)).toBe(true);
    expect(settings.folders.some((folder) => folder.label === "home")).toBe(true);
    expect(settings.folders.every((folder) => folder.readOnly === false)).toBe(true);
  });

  it("adds and removes folders", () => {
    const { store } = createTestContext();
    const extraDir = join(dataDir, "extra");
    mkdirSync(extraDir);

    const afterAdd = addAllowedFolder(store, { path: extraDir, label: "extra" });
    expect(afterAdd.folders.some((folder) => folder.label === "extra")).toBe(true);

    const folderId = afterAdd.folders.find((folder) => folder.label === "extra")!.id;
    const afterRemove = removeAllowedFolder(store, folderId);
    expect(afterRemove.folders.some((folder) => folder.label === "extra")).toBe(false);
  });

  it("updates read-only flag", () => {
    const { store } = createTestContext();
    const folderId = getFilesystemSettings(store).folders[0]!.id;
    const updated = updateAllowedFolder(store, folderId, { readOnly: true });
    expect(updated.folders[0]?.readOnly).toBe(true);
  });

  it("checks path containment", () => {
    const root = join(dataDir || mkdtempSync(join(tmpdir(), "kampaku-path-test-")), "root");
    mkdirSync(join(root, "nested"), { recursive: true });
    dataDir = join(root, "..");

    expect(isPathWithinFolder(join(root, "nested"), root)).toBe(true);
    expect(isPathWithinFolder(join(root, ".."), root)).toBe(false);
  });

  it("exposes settings via API and attaches policy to jobs", async () => {
    const { client, config, store } = createTestContext();
    const settings = await client.getFilesystemSettings();
    expect(settings.folders.length).toBeGreaterThan(0);

    const extraDir = join(dataDir, "projects");
    mkdirSync(extraDir);
    const updated = await client.addAllowedFolder({ path: extraDir, label: "projects" });
    expect(updated.folders.some((folder) => folder.label === "projects")).toBe(true);

    const projectId = store.getBootstrapState<{ projectId: string }>("default_project")!.projectId;
    const goal = await createGoalWithPlan(store, config, {
      projectId,
      objective: "Test filesystem policy on job",
      repositoryRole: "core",
    });

    const jobs = store.getJobsByTaskIds(
      store.getTasksByGoal(goal.goal.id).map((task) => task.id),
    );
    expect(jobs[0]?.input.filesystemPolicy).toBeDefined();
    expect((jobs[0]?.input.filesystemPolicy as { folders: unknown[] }).folders.length).toBe(
      updated.folders.length,
    );
    expect(jobs[0]?.input.globalSystemPrompt).toBe(DEFAULT_GLOBAL_SYSTEM_PROMPT);
  });

  it("reads and updates the global system prompt through the API", async () => {
    const { client } = createTestContext();
    expect((await client.getGlobalSystemPromptSettings()).prompt).toBe(DEFAULT_GLOBAL_SYSTEM_PROMPT);

    const updated = await client.updateGlobalSystemPrompt("Serve the objective and report truthfully.");
    expect(updated.prompt).toBe("Serve the objective and report truthfully.");
    expect((await client.getGlobalSystemPromptSettings()).prompt).toBe(updated.prompt);
  });

  it("rejects an empty global system prompt", async () => {
    const { client } = createTestContext();
    await expect(client.updateGlobalSystemPrompt("   ")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects duplicate folders through API", async () => {
    const { client, workspaceRoot } = createTestContext();
    await expect(client.addAllowedFolder({ path: workspaceRoot })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects missing paths when adding folders", async () => {
    const { client } = createTestContext();
    await expect(
      client.addAllowedFolder({ path: join(dataDir, "does-not-exist") }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
