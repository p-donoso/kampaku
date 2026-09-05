import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import {
  canExecuteLeaf,
  collectLeavesInOrder,
  findNextExecutableWorkItem,
} from "../src/application/pm/work-item-order.js";
import { createProject } from "../src/application/projects.js";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { Store } from "../src/persistence/store.js";

describe("work-item-order", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-work-item-order-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    return { store, pmStore, agentStore };
  }

  it("returns leaves in depth-first order", () => {
    const { store, pmStore, agentStore } = createStores();
    const project = createProject(store, { slug: "order", name: "Order", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const epicId = uuidv4();
    const leaf1Id = uuidv4();
    const leaf2Id = uuidv4();

    pmStore.createWorkItem({
      id: epicId,
      projectId: project.id,
      title: "Epic",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: leaf1Id,
      projectId: project.id,
      parentId: epicId,
      title: "Leaf 1",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: leaf2Id,
      projectId: project.id,
      parentId: epicId,
      title: "Leaf 2",
      status: "todo",
      priority: 0,
      sortOrder: 1,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const tree = pmStore.buildWorkItemTree(pmStore.listWorkItemsByProject(project.id));
    const leaves = collectLeavesInOrder(tree);
    expect(leaves.map((leaf) => leaf.title)).toEqual(["Leaf 1", "Leaf 2"]);
  });

  it("blocks a leaf until earlier leaves are done", () => {
    const { store, pmStore, agentStore } = createStores();
    const project = createProject(store, { slug: "gate", name: "Gate", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const leaf1Id = uuidv4();
    const leaf2Id = uuidv4();

    for (const [id, title, sortOrder, status] of [
      [leaf1Id, "First", 0, "todo"],
      [leaf2Id, "Second", 1, "todo"],
    ] as const) {
      pmStore.createWorkItem({
        id,
        projectId: project.id,
        title,
        status,
        priority: 0,
        sortOrder,
        assigneeAgentId: kampaku.id,
        acceptanceCriteria: [],
        dependsOn: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    const items = pmStore.listWorkItemsByProject(project.id);
    const leaves = collectLeavesInOrder(pmStore.buildWorkItemTree(items));
    const second = items.find((item) => item.id === leaf2Id)!;

    expect(canExecuteLeaf(second, leaves, items, pmStore).ok).toBe(false);
    pmStore.updateWorkItem(leaf1Id, { status: "done" });
    const refreshed = pmStore.listWorkItemsByProject(project.id);
    const refreshedLeaves = collectLeavesInOrder(pmStore.buildWorkItemTree(refreshed));
    expect(canExecuteLeaf(refreshed.find((item) => item.id === leaf2Id)!, refreshedLeaves, refreshed, pmStore).ok).toBe(
      true,
    );
  });

  it("findNextExecutableWorkItem skips blocked and in-progress tasks", () => {
    const { store, pmStore, agentStore } = createStores();
    const project = createProject(store, { slug: "next", name: "Next", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const now = new Date().toISOString();
    const firstId = uuidv4();
    const secondId = uuidv4();

    pmStore.createWorkItem({
      id: firstId,
      projectId: project.id,
      title: "Running",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pmStore.createWorkItem({
      id: secondId,
      projectId: project.id,
      title: "Waiting",
      status: "todo",
      priority: 0,
      sortOrder: 1,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(findNextExecutableWorkItem(pmStore, project.id)).toBeNull();

    pmStore.updateWorkItem(firstId, { status: "done" });
    expect(findNextExecutableWorkItem(pmStore, project.id)?.id).toBe(secondId);
  });
});
