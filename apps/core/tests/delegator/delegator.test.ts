import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { matchAgentStub } from "../../src/delegator/match-agent.js";
import { decomposeIntentStub } from "../../src/delegator/types.js";
import { decomposeIntent } from "../../src/delegator/decompose-intent.js";
import { planAndDelegate } from "../../src/delegator/plan-and-delegate.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";

describe("delegator", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("surfaces model failures instead of substituting a generic plan", async () => {
    const config = loadConfig({ plannerMode: "llm" });
    const broker = {
      isAvailable: async () => true,
      chat: async () => { throw new Error("provider failed"); },
    } as unknown as Parameters<typeof decomposeIntent>[0]["broker"];

    await expect(decomposeIntent({
      intent: "Create a language learning app",
      projectSlug: "language-app",
      agents: [],
      config,
      broker,
    })).rejects.toThrow("LLM planning failed");
  });

  function createContext() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-delegator-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);

    const kampaku = agentStore.getKampakuAgent();
    agentStore.createSubAgent({
      slug: "qa-engineer",
      name: "QA Engineer",
      responsibilities: "testing qa quality assurance",
      systemPrompt: "Test software",
      parentId: kampaku.id,
    });

    return { store, pmStore, agentStore, config };
  }

  it("decomposes intent into recursive task tree in stub mode", () => {
    const plan = decomposeIntentStub(
      "Create a project called Demo App with login, REST API, and tests",
      "demo-app",
    );

    expect(plan.project?.slug).toBe("demo-app");
    expect(plan.work_items.length).toBeGreaterThanOrEqual(1);
    expect(plan.milestones?.[0]?.executed_by).toBe("ai_agents");
  });

  it("matches work items to specialized agents", () => {
    const { agentStore, config } = createContext();

    const result = matchAgentStub({
      workItem: {
        title: "Write tests",
        description: "Unit tests for API",
        priority: 0,
        suggested_responsibility: "testing",
      },
      agentStore,
      config,
    });

    expect(result.agent.slug).toBe("qa-engineer");
  });

  it("routes AI training tasks to project ai agents not skillmaster", () => {
    const { agentStore, config } = createContext();
    const kampaku = agentStore.getKampakuAgent();
    const lead = agentStore.createSubAgent({
      slug: "demo-lead",
      name: "Demo Lead",
      responsibilities: "Project lead",
      systemPrompt: "Lead",
      parentId: kampaku.id,
    });
    agentStore.createSubAgent({
      slug: "demo-ai",
      name: "Demo AI",
      responsibilities: "Vectorization and training pipeline",
      systemPrompt: "AI work",
      parentId: lead.id,
    });
    agentStore.createSubAgent({
      slug: "kampaku-skillmaster",
      name: "Skillmaster",
      responsibilities: "Create and maintain skills in the Kampaku catalog",
      systemPrompt: "Skill catalog author",
      parentId: kampaku.id,
    });

    const result = matchAgentStub({
      workItem: {
        title: "Research vectorization techniques",
        description: "Survey raster-to-vector models and training pipeline",
        priority: 0,
        suggested_responsibility: "ai",
      },
      agentStore,
      config,
      projectLeadSlug: "demo-lead",
    });

    expect(result.agent.slug).toBe("demo-ai");
  });

  it("excludes platform team agents from external project assignment", () => {
    const { agentStore, config } = createContext();
    const kampaku = agentStore.getKampakuAgent();
    const platformLead = agentStore.createSubAgent({
      slug: "kampaku-manager",
      name: "Kampaku Manager",
      responsibilities: "Platform lead",
      systemPrompt: "Manage platform",
      parentId: kampaku.id,
      source: "bootstrap",
    });
    agentStore.createSubAgent({
      slug: "kampaku-fullstack",
      name: "Kampaku Full Stack",
      responsibilities: "Platform full stack development",
      systemPrompt: "Build platform",
      parentId: platformLead.id,
      source: "bootstrap",
    });
    const projectLead = agentStore.createSubAgent({
      slug: "svg-icon-lab-lead",
      name: "SVG Icon Lab Lead",
      responsibilities: "Project lead",
      systemPrompt: "Lead svg icon lab",
      parentId: kampaku.id,
    });
    agentStore.createSubAgent({
      slug: "svg-icon-lab-frontend",
      name: "SVG Icon Lab Frontend",
      responsibilities: "React canvas frontend",
      systemPrompt: "Frontend",
      parentId: projectLead.id,
    });

    const result = matchAgentStub({
      workItem: {
        title: "Set up frontend scaffold with Vite + React",
        description: "Create React canvas editor",
        priority: 0,
        assignee_slug: "kampaku-fullstack",
      },
      agentStore,
      config,
      projectSlug: "svg-icon-lab",
      projectLeadSlug: "svg-icon-lab-lead",
    });

    expect(result.agent.slug).toBe("svg-icon-lab-frontend");
    expect(result.reason).toContain("Remapped platform assignee");
  });

  it("planAndDelegate persists project and assignments", async () => {
    const ctx = createContext();

    const result = await planAndDelegate(ctx, {
      intent: "Create project Demo App with login, REST API, and tests",
      projectSlug: "demo-app",
    });

    expect(result.projectSlug).toBe("demo-app");
    expect(result.workItemsCreated).toBeGreaterThanOrEqual(3);
    expect(result.assignments.length).toBe(result.workItemsCreated);
    expect(result.planValidation.ok).toBe(true);
    expect(result.granularity).toBe("fine");

    const overview = ctx.pmStore.getProjectOverview(
      ctx.store.getProjectBySlug("demo-app")!,
    );
    expect(overview.documents.length).toBeGreaterThan(0);
    expect(overview.milestones.length).toBe(2);
    expect(overview.workItems.length).toBeGreaterThan(0);
    expect(overview.documents.some((d) => /coherence/i.test(d.title))).toBe(true);
  });

  it("assigns a newly created project team before routing its tasks", async () => {
    const ctx = createContext();
    await planAndDelegate(ctx, {
      intent: "Create a language learning project with lessons and tests",
      projectSlug: "language-app",
      createMissingAgents: true,
      granularity: "standard",
    });

    const lead = ctx.agentStore.getAgentBySlugOrId("language-app-lead");
    const project = ctx.store.getProjectBySlug("language-app");
    expect(lead).toBeDefined();
    expect(project?.projectLeadAgentId).toBe(lead?.id);
  });
});
