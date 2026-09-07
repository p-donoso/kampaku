import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore, PmStoreError } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";
import { createProject } from "../../src/application/projects.js";
import { v4 as uuidv4 } from "uuid";

describe("pm-store", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-pm-store-"));
    const { db } = createDb(join(dataDir, "kampaku.db"));
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    return { store, pmStore, agentStore };
  }

  it("creates project overview with recursive work item tree", () => {
    const { store, pmStore, agentStore } = createStores();
    const project = createProject(store, {
      slug: "demo-app",
      name: "Demo App",
      status: "planning",
    });

    const kampaku = agentStore.getKampakuAgent();
    const engineer = agentStore.createSubAgent({
      slug: "backend-dev",
      name: "Backend Dev",
      responsibilities: "backend api rest",
      systemPrompt: "Build APIs",
      parentId: kampaku.id,
    });

    const parentId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: parentId,
      projectId: project.id,
      title: "API module",
      status: "todo",
      priority: 1,
      sortOrder: 0,
      assigneeAgentId: engineer.id,
      assignedByAgentId: kampaku.id,
      acceptanceCriteria: ["Module integrated"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    pmStore.createWorkItem({
      id: uuidv4(),
      projectId: project.id,
      parentId,
      title: "REST endpoints",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: engineer.id,
      assignedByAgentId: kampaku.id,
      acceptanceCriteria: ["Endpoints pass tests"],
      dependsOn: ["API module"],
      createdAt: now,
      updatedAt: now,
    });

    const overview = pmStore.getProjectOverview(project);
    expect(overview.documents).toHaveLength(0);
    expect(overview.workItems).toHaveLength(1);
    expect(overview.workItems[0]?.children).toHaveLength(1);

    const descendantIds = agentStore.getDescendantIds(kampaku.id);
    expect(descendantIds).toContain(engineer.id);

    const items = pmStore.listWorkItemsForAgents(
      agentStore.getAgentIdsWithSubordinates(kampaku.id),
    );
    expect(items).toHaveLength(2);
  });

  it("records delegation events", () => {
    const { store, pmStore, agentStore } = createStores();
    const project = createProject(store, { slug: "evt", name: "Evt", status: "planning" });
    const kampaku = agentStore.getKampakuAgent();
    const workItemId = uuidv4();
    const now = new Date().toISOString();

    pmStore.createWorkItem({
      id: workItemId,
      projectId: project.id,
      title: "Task",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      assignedByAgentId: kampaku.id,
      routingReason: "test routing",
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    pmStore.recordDelegationEvent({
      workItemId,
      fromAgentId: kampaku.id,
      toAgentId: kampaku.id,
      reason: "test routing",
      occurredAt: now,
    });

    const events = pmStore.listDelegationEventsByWorkItem(workItemId);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe("test routing");
  });

  it("rejects parent moves that create cycles", () => {
    const { store, pmStore } = createStores();
    const project = createProject(store, { slug: "cycle", name: "Cycle", status: "planning" });
    const now = new Date().toISOString();
    const rootId = uuidv4();
    const childId = uuidv4();

    pmStore.createWorkItem({
      id: rootId,
      projectId: project.id,
      title: "Root",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    pmStore.createWorkItem({
      id: childId,
      projectId: project.id,
      parentId: rootId,
      title: "Child",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(() => pmStore.updateWorkItem(rootId, { parentId: childId })).toThrow(PmStoreError);
  });

  it("deletes work items with cascade", () => {
    const { store, pmStore } = createStores();
    const project = createProject(store, { slug: "del", name: "Del", status: "planning" });
    const now = new Date().toISOString();
    const rootId = uuidv4();
    const childId = uuidv4();

    pmStore.createWorkItem({
      id: rootId,
      projectId: project.id,
      title: "Root",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    pmStore.createWorkItem({
      id: childId,
      projectId: project.id,
      parentId: rootId,
      title: "Child",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(() => pmStore.deleteWorkItem(rootId)).toThrow(PmStoreError);
    pmStore.deleteWorkItem(rootId, { cascade: true });
    expect(pmStore.listWorkItemsByProject(project.id)).toHaveLength(0);
  });
});
