import { mkdtempSync, rmSync } from "node:fs";
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
const MARKER = "EVAL-SURFACE-MARKER";

/**
 * Automated coverage for docs/eval/02-three-surfaces.md.
 */
describe("eval suite 02 three surfaces", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-three-surfaces-"));
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
    return { app, config, ctx, store, agentStore };
  }

  it("PATCH description is visible on GET project overview", async () => {
    const { app, store } = createFreshInstance();
    const project = store.listProjects()[0]!;

    const patched = await app.request(`/api/v1/projects/${project.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: MARKER }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { id: string; description?: string };
    expect(body.id).toBe(project.id);
    expect(body.description).toBe(MARKER);

    const overview = await app.request(`/api/v1/projects/${project.slug}`);
    expect(overview.status).toBe(200);
    const data = (await overview.json()) as { project: { id: string; description?: string | null } };
    expect(data.project.id).toBe(project.id);
    expect(data.project.description).toBe(MARKER);
  });

  it("Kampaku chat may set description marker and report the same id", async () => {
    const { ctx, config, store } = createFreshInstance();
    const beforeId = store.listProjects()[0]!.id;

    const response = await runKampakuChat(
      ctx,
      config,
      "Pick one existing project or create the smallest placeholder project if none exists. Then set a short note or display name I can recognize: EVAL-SURFACE-MARKER. Confirm the id.",
    );

    expect(response.toolsUsed).toEqual(expect.arrayContaining(["list_projects", "update_project"]));
    expect(response.reply).toContain(MARKER);
    expect(response.reply).toContain(beforeId);
    expect(store.listProjects()).toHaveLength(1);
    expect(store.listProjects()[0]!.id).toBe(beforeId);
    expect(store.listProjects()[0]!.description).toBe(MARKER);
  });

  it("allows Kampaku name/description update and denies governance fields", async () => {
    const { ctx, store, agentStore } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();
    const project = store.listProjects()[0]!;

    const allowed = await executeToolCall(
      ctx,
      "update_project",
      JSON.stringify({ project_slug_or_id: project.slug, description: MARKER }),
      { agentId: kampaku.id },
    );
    expect(allowed.output).toMatchObject({
      id: project.id,
      slug: project.slug,
      description: MARKER,
    });

    await expect(
      executeToolCall(
        ctx,
        "update_project",
        JSON.stringify({
          project_slug_or_id: project.slug,
          project_lead_slug: "kampaku-manager",
        }),
        { agentId: kampaku.id },
      ),
    ).rejects.toThrow(/name and description/i);
  });

  it("fresh chat turn after CLI-equivalent mutation reports the marker", async () => {
    const { ctx, config, store } = createFreshInstance();
    const project = store.listProjects()[0]!;
    store.updateProject(project.id, { description: `${MARKER}-CLI` });

    const response = await runKampakuChat(
      ctx,
      config,
      "Confirm the current project description marker for kampaku.",
    );

    expect(response.toolsUsed).toContain("get_project");
    expect(response.reply).toContain(`${MARKER}-CLI`);
    expect(response.reply).toContain(project.id);
  });
});
