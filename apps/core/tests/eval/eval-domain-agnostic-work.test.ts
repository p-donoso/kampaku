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
import { planAndDelegate } from "../../src/delegator/plan-and-delegate.js";
import { normalizePlannedWorkItems } from "../../src/delegator/types.js";
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
 * Automated coverage for docs/eval/18-domain-agnostic-work.md.
 * Locks domain-agnostic staffing/planning — not a writing-vs-software fork.
 */
describe("eval suite 18 domain-agnostic work", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-domain-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: WORKSPACE_ROOT,
      agentMode: "stub",
      plannerMode: "stub",
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
    return { config, ctx, store, agentStore, pmStore, skillStore };
  }

  it("adequate-team ask without roles does not invent a default engineering roster", async () => {
    const { ctx, config, agentStore } = createFreshInstance();
    const response = await runKampakuChat(
      ctx,
      config,
      "I am writing a novel, not software. For project my-first-novel, build an adequate standing team that covers all aspects and propose the first slice of work. Do not invent engineering roles. Do not start writing the manuscript yet.",
    );

    expect(response.toolsUsed ?? []).not.toContain("staff_project_team");
    expect(response.reply).toContain("<kampaku-question>");
    expect(response.reply.toLowerCase()).toMatch(/specialist roles|cover/);
    expect(response.reply.toLowerCase()).not.toMatch(/default engineering roster invented/);
    expect(agentStore.getAgentBySlugOrId("my-first-novel-frontend")).toBeUndefined();
    expect(agentStore.getAgentBySlugOrId("my-first-novel-plotting")).toBeUndefined();
  });

  it("emperor-named roles staff as-is and propose a domain-agnostic first slice", async () => {
    const { ctx, config, agentStore, pmStore, store } = createFreshInstance();
    const conversation = await runKampakuChat(
      ctx,
      config,
      "For project my-first-novel, build an adequate standing team covering all aspects. Do not invent engineering roles. Do not start yet.",
    );

    const staffed = await runKampakuChat(ctx, config, {
      message: "Lead plus plotting, prose, and continuity. No frontend or backend.",
      conversationId: conversation.conversationId,
    });

    expect(staffed.toolsUsed).toEqual(
      expect.arrayContaining(["staff_project_team", "list_agents", "propose_project_plan"]),
    );
    expect(staffed.reply.toLowerCase()).toMatch(/first work slice|domain-agnostic/);
    expect(staffed.reply.toLowerCase()).not.toMatch(/\bnpm test\b/);
    expect(staffed.reply.toLowerCase()).not.toMatch(/my-first-novel-frontend|my-first-novel-backend/);
    expect(agentStore.getAgentBySlugOrId("my-first-novel-frontend")).toBeUndefined();
    expect(agentStore.getAgentBySlugOrId("my-first-novel-plotting")).toBeTruthy();

    const project = store.getProjectBySlug("my-first-novel")!;
    const items = pmStore.listWorkItemsByProject(project.id);
    expect(items.length).toBeGreaterThan(0);
    const acBlob = items.flatMap((item) => item.acceptanceCriteria).join("\n").toLowerCase();
    expect(acBlob).toMatch(/deliverable|acceptance check|domain/);
    expect(acBlob).not.toMatch(/npm test|openapi/);
  });

  it("create_missing_agents does not seed six-role software roster onto a domain project", async () => {
    const { ctx, agentStore, store } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();
    await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: "my-first-novel",
        specialist_roles: ["worldbuilding", "voice", "continuity"],
      }),
      { agentId: kampaku.id },
    );

    await planAndDelegate(
      {
        store: ctx.store,
        pmStore: ctx.pmStore,
        agentStore,
        config: ctx.config,
        skillStore: ctx.skillStore,
      },
      {
        intent:
          "Plan the first slice for my-first-novel covering all named aspects. Not software. Do not invent engineering.",
        projectSlug: "my-first-novel",
        createMissingAgents: true,
        granularity: "coarse",
      },
    );

    expect(agentStore.getAgentBySlugOrId("my-first-novel-frontend")).toBeUndefined();
    expect(agentStore.getAgentBySlugOrId("my-first-novel-backend")).toBeUndefined();
    expect(agentStore.getAgentBySlugOrId("my-first-novel-qa")).toBeUndefined();
    expect(agentStore.getAgentBySlugOrId("my-first-novel-auditor")).toBeUndefined();
    expect(store.getProjectBySlug("kampaku")?.projectLeadAgentId).toBeTruthy();
  });

  it("arbitrary specialist roles get workflow skills; software eval-team still works", async () => {
    const { ctx, agentStore, skillStore } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();

    const software = await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: "eval-team-demo",
        specialist_roles: ["frontend", "backend", "qa"],
      }),
      { agentId: kampaku.id },
    );
    expect(software.output).toMatchObject({
      specialistSlugs: ["eval-team-demo-frontend", "eval-team-demo-backend", "eval-team-demo-qa"],
    });

    const domain = await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: "my-first-novel",
        specialist_roles: ["worldbuilding", "voice", "continuity"],
      }),
      { agentId: kampaku.id },
    );
    expect(domain.output).toMatchObject({
      specialistSlugs: [
        "my-first-novel-worldbuilding",
        "my-first-novel-voice",
        "my-first-novel-continuity",
      ],
    });

    const specialist = agentStore.getAgentBySlugOrId("my-first-novel-worldbuilding")!;
    const assigned = skillStore.listAgentSkills(specialist.id);
    expect(assigned).toEqual(expect.arrayContaining(["workflow-specialist-delegation"]));
  });

  it("normalize pads non-engineering intents without npm defaults", () => {
    const items = normalizePlannedWorkItems(
      [
        {
          title: "Opening deliverable",
          description: "Produce the first coherent deliverable for this domain slice with clear success criteria.",
          priority: 0,
        },
      ],
      "Build an adequate team covering all aspects for my novel. Not software. Do not invent engineering.",
    );
    const ac = (items[0]!.acceptance_criteria ?? []).join(" ").toLowerCase();
    expect(ac).toMatch(/deliverable|acceptance check/);
    expect(ac).not.toMatch(/npm test/);
  });

  it("soft contrast improve on kampaku does not rewrite another project into engineers", async () => {
    const { ctx, config, agentStore } = createFreshInstance();
    const kampaku = agentStore.getKampakuAgent();
    await executeToolCall(
      ctx,
      "staff_project_team",
      JSON.stringify({
        project_slug: "my-first-novel",
        specialist_roles: ["worldbuilding", "voice", "continuity"],
      }),
      { agentId: kampaku.id },
    );
    const before = agentStore
      .listAllAgents()
      .filter((agent) => agent.slug.startsWith("my-first-novel-"))
      .map((agent) => agent.slug)
      .sort();

    const response = await runKampakuChat(
      ctx,
      config,
      "Now improve the kampaku platform project only — keep that team's software shape. Do not rewrite my-first-novel into engineers.",
    );

    expect(response.toolsUsed ?? []).not.toContain("staff_project_team");
    expect(response.reply).toContain("<kampaku-question>");
    expect(agentStore.getAgentBySlugOrId("my-first-novel-frontend")).toBeUndefined();
    expect(
      agentStore
        .listAllAgents()
        .filter((agent) => agent.slug.startsWith("my-first-novel-"))
        .map((agent) => agent.slug)
        .sort(),
    ).toEqual(before);
  });
});
