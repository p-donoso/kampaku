import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { matchAgentStub } from "../src/delegator/match-agent.js";
import { decomposeIntentStub } from "../src/delegator/types.js";
import { planAndDelegate } from "../src/delegator/plan-and-delegate.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { Store } from "../src/persistence/store.js";

describe("delegator", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createContext() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-delegator-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
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
      "Crea un proyecto Demo App con login, API REST y tests",
      "demo-app",
    );

    expect(plan.project?.slug).toBe("demo-app");
    expect(plan.work_items.length).toBeGreaterThanOrEqual(3);
    expect(plan.milestones?.[0]?.executed_by).toBe("ai_agents");
    expect(plan.work_items.some((item) => item.parent_ref)).toBe(true);
  });

  it("matches work items to specialized agents", () => {
    const { agentStore, config } = createContext();

    const result = matchAgentStub({
      workItem: {
        title: "Escribir tests",
        description: "Unit tests for API",
        priority: 0,
        suggested_responsibility: "testing",
      },
      agentStore,
      config,
    });

    expect(result.agent.slug).toBe("qa-engineer");
  });

  it("planAndDelegate persists project and assignments", async () => {
    const ctx = createContext();

    const result = await planAndDelegate(ctx, {
      intent: "Crea proyecto Demo App con login, API REST y tests",
      projectSlug: "demo-app",
    });

    expect(result.projectSlug).toBe("demo-app");
    expect(result.workItemsCreated).toBeGreaterThanOrEqual(3);
    expect(result.assignments.length).toBe(result.workItemsCreated);

    const overview = ctx.pmStore.getProjectOverview(
      ctx.store.getProjectBySlug("demo-app")!,
    );
    expect(overview.documents.length).toBeGreaterThan(0);
    expect(overview.milestones.length).toBe(2);
    expect(overview.workItems.length).toBeGreaterThan(0);
    expect(overview.documents.some((d) => d.title.includes("coherencia"))).toBe(true);
  });
});
