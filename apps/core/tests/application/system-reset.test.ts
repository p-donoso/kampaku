import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapProject } from "../../src/application/projects.js";
import { resetAllData, resetBootstrapAgents } from "../../src/application/system-reset.js";
import { loadConfig } from "../../src/config.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { createDb } from "../../src/persistence/db.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { Store } from "../../src/persistence/store.js";

describe("system reset", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-system-reset-"));
    const workspaceRoot = join(dataDir, "workspace");
    mkdirSync(workspaceRoot);
    const config = loadConfig({ dataDir, dbPath: join(dataDir, "kampaku.db"), workspaceRoot });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    bootstrapProject(store, config, db);
    return { config, db, store, agents: new AgentStore(db), memories: new MemoryStore(db) };
  }

  it("recreates only bootstrap agents and transfers learnings by slug", () => {
    const { config, db, store, agents, memories } = setup();
    const oldManager = agents.getAgentBySlugOrId("kampaku-manager")!;
    expect(oldManager.source).toBe("bootstrap");
    memories.create({ agentId: oldManager.id, kind: "learning", title: "Keep", body: "Reusable lesson" });
    memories.create({ agentId: oldManager.id, kind: "log", title: "Drop", body: "Session detail" });
    const manual = agents.createSubAgent({ slug: "manual-helper", name: "Manual helper", responsibilities: "Help", systemPrompt: "Help", parentId: oldManager.id });

    const result = resetBootstrapAgents(store, config, db, true);
    const newManager = agents.getAgentBySlugOrId("kampaku-manager")!;

    expect(newManager.id).not.toBe(oldManager.id);
    expect(result.inheritedLearnings).toBe(1);
    expect(memories.count(newManager.id)).toEqual({ logs: 0, learnings: 1 });
    expect(agents.getAgentBySlugOrId(manual.id)?.parentId).toBe(newManager.id);
  });

  it("deletes all data and applies a clean bootstrap", () => {
    const { config, db, store, agents } = setup();
    agents.createSubAgent({ slug: "temporary", name: "Temporary", responsibilities: "Temp", systemPrompt: "Temp", parentId: "kampaku" });
    store.createProject({ id: "extra", slug: "extra", name: "Extra", repositories: [], createdAt: new Date().toISOString() });

    const result = resetAllData(store, config, db);

    expect(result.createdAgents.length).toBeGreaterThan(0);
    expect(agents.getAgentBySlugOrId("temporary")).toBeUndefined();
    expect(store.listProjects()).toHaveLength(1);
  });
});
