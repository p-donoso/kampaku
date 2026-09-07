import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getGoalAudit, listGoals } from "../../src/application/goals.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { createGoalWithPlan } from "../../src/planner/create-goal.js";

describe("application/goals", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createTestStore() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-app-test-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    bootstrapProject(store, config);
    return { store, config };
  }

  it("creates and audits a goal", async () => {
    const { store, config } = createTestStore();
    const projectId = store.getBootstrapState<{ projectId: string }>("default_project")!.projectId;

    const result = await createGoalWithPlan(store, config, {
      projectId,
      objective: "Test objective",
      repositoryRole: "core",
    });

    const audit = getGoalAudit(store, result.goal.id);
    expect(audit).toBeDefined();
    expect(audit?.goal.objective).toBe("Test objective");
    expect(audit?.tasks).toHaveLength(1);
    expect(audit?.jobs).toHaveLength(1);
  });

  it("lists goals in reverse chronological order", async () => {
    const { store, config } = createTestStore();
    const projectId = store.getBootstrapState<{ projectId: string }>("default_project")!.projectId;

    await createGoalWithPlan(store, config, {
      projectId,
      objective: "First",
      repositoryRole: "core",
    });
    await createGoalWithPlan(store, config, {
      projectId,
      objective: "Second",
      repositoryRole: "core",
    });

    const goals = listGoals(store, { limit: 2 });
    expect(goals).toHaveLength(2);
    expect(goals[0]?.objective).toBe("Second");
    expect(goals[1]?.objective).toBe("First");
  });
});
