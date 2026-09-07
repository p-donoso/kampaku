import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { ensureLeafSplitWorkItem, isOverweightLeaf } from "../../src/application/pm/leaf-splitter.js";
import { createProject } from "../../src/application/projects.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";

describe("leaf splitter", () => {
  let dataDir: string;
  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("splits an overweight leaf into children with a bounded file budget", () => {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-split-"));
    const { db } = createDb(join(dataDir, "t.db"));
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const project = createProject(store, { slug: "demo", name: "Demo", status: "active" });
    const now = new Date().toISOString();
    const id = uuidv4();
    const item = pmStore.createWorkItem({
      id,
      projectId: project.id,
      title: "Build feature",
      description:
        "Create src/a.ts, src/b.ts, src/c.ts, and src/d.ts with full context, AGENTS.md conventions, and verification notes so the worker does not pack an entire feature into one session.",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["npm test succeeds", "npm run build succeeds", "npm run test:e2e succeeds"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(isOverweightLeaf(item)).toBe(true);
    ensureLeafSplitWorkItem(pmStore, agentStore, store, item);
    const children = pmStore.listWorkItemsByProject(project.id).filter((row) => row.parentId === id);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(children.every((child) => !isOverweightLeaf(child))).toBe(true);
  });
});
