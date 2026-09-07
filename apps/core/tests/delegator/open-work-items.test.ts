import { describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { listOpenWorkItems } from "../../src/delegator/open-work-items.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";

describe("listOpenWorkItems", () => {
  it("returns incomplete tasks with parent titles", () => {
    const { db } = createDb(":memory:");
    const agents = new AgentStore(db);
    const pm = new PmStore(db);
    const dev = agents.createSubAgent({
      slug: "dev",
      name: "Dev",
      parentId: agents.getKampakuAgent().id,
      responsibilities: "Dev",
      systemPrompt: "Dev",
    });
    const now = new Date().toISOString();
    const parentId = uuidv4();
    const openId = uuidv4();
    const doneId = uuidv4();
    pm.createWorkItem({
      id: parentId,
      projectId: "p1",
      title: "Epic",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pm.createWorkItem({
      id: openId,
      projectId: "p1",
      parentId,
      title: "Open leaf",
      status: "todo",
      priority: 0,
      sortOrder: 1,
      assigneeAgentId: dev.id,
      acceptanceCriteria: ["tests pass"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    pm.createWorkItem({
      id: doneId,
      projectId: "p1",
      title: "Finished",
      status: "done",
      priority: 0,
      sortOrder: 2,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    const open = listOpenWorkItems(pm.listWorkItemsByProject("p1"), agents);
    expect(open).toHaveLength(2);
    expect(open.find((item) => item.title === "Open leaf")).toMatchObject({
      parentTitle: "Epic",
      assigneeSlug: "dev",
      status: "todo",
    });
    expect(open.some((item) => item.title === "Finished")).toBe(false);
  });
});
