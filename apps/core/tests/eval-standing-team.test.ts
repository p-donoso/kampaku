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
 * Automated coverage for docs/eval/03-standing-team.md.
 */
describe("eval suite 03 standing team", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-standing-team-"));
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

  it("staff_project_team creates nested lead+specialists and links project lead without work items", async () => {
    const { ctx, store, agentStore, pmStore } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();
    const beforeAgents = agentStore.listAllAgents().length;
    const beforeWork = store.listProjects().reduce(
      (sum, project) => sum + pmStore.listWorkItemsByProject(project.id).length,
      0,
    );

    const result = await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: "eval-team-demo",
        specialist_roles: ["frontend", "backend", "qa"],
      }),
      { agentId: kampaku.id },
    );

    const output = result.output as {
      project: { id: string; slug: string; projectLeadSlug: string };
      leadSlug: string;
      specialistSlugs: string[];
      workItemsCreated: number;
      jobsStarted: number;
    };
    expect(output.project.slug).toBe("eval-team-demo");
    expect(output.leadSlug).toBe("eval-team-demo-lead");
    expect(output.specialistSlugs).toEqual([
      "eval-team-demo-frontend",
      "eval-team-demo-backend",
      "eval-team-demo-qa",
    ]);
    expect(output.workItemsCreated).toBe(0);
    expect(output.jobsStarted).toBe(0);

    const project = store.getProjectByIdOrSlug("eval-team-demo")!;
    const lead = agentStore.getAgentBySlugOrId("eval-team-demo-lead")!;
    expect(project.projectLeadAgentId).toBe(lead.id);
    expect(lead.parentId).toBe(kampaku.id);

    for (const slug of output.specialistSlugs) {
      const agent = agentStore.getAgentBySlugOrId(slug)!;
      expect(agent.parentId).toBe(lead.id);
    }

    expect(agentStore.listAllAgents().length).toBe(beforeAgents + 4);
    const afterWork = store.listProjects().reduce(
      (sum, p) => sum + pmStore.listWorkItemsByProject(p.id).length,
      0,
    );
    expect(afterWork).toBe(beforeWork);
  });

  it("staff_project_team is idempotent and refuses conflicting lead", async () => {
    const { ctx, store, agentStore } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();

    await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({ project_slug: "eval-team-demo" }),
      { agentId: kampaku.id },
    );
    const agentsAfterFirst = agentStore.listAllAgents().length;

    const second = await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({ project_slug: "eval-team-demo" }),
      { agentId: kampaku.id },
    );
    expect(agentStore.listAllAgents().length).toBe(agentsAfterFirst);
    expect((second.output as { created: { agents: string[] } }).created.agents).toEqual([]);

    const manager = agentStore.getAgentBySlugOrId("kampaku-manager")!;
    store.updateProjectPlanning(store.getProjectByIdOrSlug("eval-team-demo")!.id, {
      projectLeadAgentId: manager.id,
    });

    await expect(
      executeToolCall(
        ctx,
        "staff_project_team",
        JSON.stringify({ project_slug: "eval-team-demo" }),
        { agentId: kampaku.id },
      ),
    ).rejects.toThrow(/conflicting lead/i);
  });

  it("stub staffing chat shows hierarchy and does not create work items", async () => {
    const { ctx, config, store, agentStore, pmStore } = createFreshInstance();
    const beforeWork = pmStore.listWorkItemsByProject(store.listProjects()[0]!.id).length;

    const response = await runKampakuChat(
      ctx,
      config,
      "I need a standing team for project work named eval-team-demo: one accountable lead and specialists for frontend, backend, and quality. Show me the hierarchy when done. Do not start coding yet.",
    );

    expect(response.toolsUsed).toEqual(expect.arrayContaining(["staff_project_team", "list_agents"]));
    expect(response.reply).toMatch(/eval-team-demo-lead/);
    expect(response.reply).toMatch(/eval-team-demo-frontend/);
    expect(response.toolsUsed).not.toContain("submit_intent");
    expect(store.getProjectByIdOrSlug("eval-team-demo")?.projectLeadAgentId).toBe(
      agentStore.getAgentBySlugOrId("eval-team-demo-lead")!.id,
    );
    expect(pmStore.listWorkItemsByProject(store.listProjects()[0]!.id).length).toBe(beforeWork);
    expect(pmStore.listWorkItemsByProject(store.getProjectByIdOrSlug("eval-team-demo")!.id)).toHaveLength(0);
  });

  it("get_project reports projectLeadSlug after staffing", async () => {
    const { ctx, agentStore } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();
    await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({ project_slug: "eval-team-demo" }),
      { agentId: kampaku.id },
    );
    const project = await executeToolCall(
      ctx,
      "get_project",
      JSON.stringify({ project_slug_or_id: "eval-team-demo" }),
    );
    expect(project.output).toMatchObject({
      project: {
        slug: "eval-team-demo",
        projectLeadSlug: "eval-team-demo-lead",
      },
    });
  });
});
