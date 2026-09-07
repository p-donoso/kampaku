import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { WikiStore } from "../../src/persistence/wiki-store.js";

const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Automated coverage for docs/eval/09-shared-truth.md.
 */
describe("eval suite 09 shared truth", () => {
  let dataDir: string;
  let strangerPath: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (strangerPath) rmSync(strangerPath, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-wiki-"));
    strangerPath = join(tmpdir(), `kampaku-eval-wiki-stranger-${Date.now()}`);
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
    const wikiStore = new WikiStore(db);
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
      undefined,
      undefined,
      wikiStore,
      db,
    );
    const ctx: KampakuToolContext = {
      store,
      agentStore,
      conversationStore,
      pmStore,
      skillStore,
      memoryStore,
      questionStore,
      wikiStore,
      config,
    };
    return { app, config, ctx, store, agentStore, pmStore, wikiStore };
  }

  async function bootstrapPlanExecute(ctx: KampakuToolContext, agentStore: AgentStore) {
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
    await executeToolCall(
      ctx,
      "execute_approved_plan",
      JSON.stringify({ project_slug_or_id: "eval-stranger" }),
      { agentId: kampaku.id },
    );
  }

  it("publish_shared_knowledge writes published pages matching stranger disk", async () => {
    const { app, ctx, store, agentStore, wikiStore } = createFreshInstance();
    await bootstrapPlanExecute(ctx, agentStore);
    const kampaku = agentStore.getKampakuAgent();
    const project = store.getProjectBySlug("eval-stranger")!;

    // Inject npm fiction as pending proposal — must not be claimed live after publish
    wikiStore.createPage({
      projectId: project.id,
      slug: "fiction-pending",
      title: "Fiction pending",
      contentMd: "# Pending fiction\n\nnpm run build with Express\n",
      status: "published",
    });
    const fiction = wikiStore.getPageBySlug(project.id, "fiction-pending")!;
    wikiStore.proposeEdit(fiction.id, {
      contentMd: "# Still pending\n\nnpm run build\n",
      proposedByAgentId: kampaku.id,
    });

    const result = await executeToolCall(
      ctx,
      "publish_shared_knowledge",
      JSON.stringify({ project_slug_or_id: project.slug }),
      { agentId: kampaku.id },
    );
    const output = result.output as {
      publishedPages: Array<{ slug: string; status: string }>;
      pendingPages: Array<{ slug: string }>;
      emperorReadOrder: string[];
    };

    expect(output.publishedPages.map((page) => page.slug)).toEqual(
      expect.arrayContaining(["current-implementation", "dev-setup", "roadmap"]),
    );
    expect(output.publishedPages.every((page) => page.status === "published")).toBe(true);
    expect(output.pendingPages.some((page) => page.slug === "fiction-pending")).toBe(true);

    const setup = wikiStore.getPageBySlug(project.id, "dev-setup")!;
    expect(setup.status).toBe("published");
    expect(setup.contentMd).toMatch(/node hello\.js/);
    expect(setup.contentMd).toMatch(/node --test/);
    expect(setup.contentMd).not.toMatch(/npm install|npm test|npm run build/);

    const current = wikiStore.getPageBySlug(project.id, "current-implementation")!;
    expect(current.contentMd).toMatch(/index\.html/);
    expect(current.contentMd).toMatch(/Hello Eval/);

    const treeRes = await app.request(`/api/v1/projects/${project.slug}/wiki`);
    expect(treeRes.status).toBe(200);
    const treeBody = (await treeRes.json()) as { pendingCount: number };
    expect(treeBody.pendingCount).toBeGreaterThanOrEqual(1);

    const pageRes = await app.request(
      `/api/v1/projects/${project.slug}/wiki/pages/current-implementation`,
    );
    expect(pageRes.status).toBe(200);
    const pageBody = (await pageRes.json()) as { page: { contentMd: string; status: string } };
    expect(pageBody.page.status).toBe("published");
    expect(pageBody.page.contentMd).toMatch(/node hello\.js/);

    await expect(
      executeToolCall(
        ctx,
        "publish_shared_knowledge",
        JSON.stringify({ project_slug_or_id: "kampaku" }),
        { agentId: kampaku.id },
      ),
    ).rejects.toThrow(/platform project/i);
  });

  it("stub chat publishes shared knowledge and points to published pages only", async () => {
    const { ctx, config, store, agentStore, wikiStore } = createFreshInstance();
    await bootstrapPlanExecute(ctx, agentStore);
    const project = store.getProjectBySlug("eval-stranger")!;

    const published = await runKampakuChat(
      ctx,
      config,
      "Update the project's shared knowledge so it reflects what is actually implemented for Hello Eval. Mark anything not built as future. Do not invent endpoints or libraries.",
    );
    expect(published.toolsUsed).toEqual(
      expect.arrayContaining(["list_projects", "publish_shared_knowledge"]),
    );
    expect(published.reply).toContain("Shared knowledge published");
    expect(published.reply).toContain("current-implementation");
    expect(published.reply).toMatch(/node hello\.js|Published/i);

    const setup = wikiStore.getPageBySlug(project.id, "dev-setup")!;
    expect(setup.contentMd).toMatch(/node hello\.js/);
    expect(setup.contentMd).not.toMatch(/npm run build/);

    // Unimplemented future: remove index mention from disk claim by deleting? already have index from execute.
    // Add a future-only claim by ensuring roadmap mentions future when something missing — create orphan future via missing express
    writeFileSync(join(strangerPath, "NOTES.md"), "scratch\n", "utf8");

    const point = await runKampakuChat(
      ctx,
      config,
      "Point me to the pages or docs I should read as emperor.",
    );
    expect(point.toolsUsed).toEqual(expect.arrayContaining(["list_projects", "get_wiki_tree"]));
    expect(point.reply).toMatch(/Pages to read|published/i);
    expect(point.reply).toContain("current-implementation");
    expect(point.reply).not.toMatch(/npm run build|Express API/i);
  });
});
