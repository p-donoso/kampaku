import { describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { rollupParentWorkItemStatuses } from "../src/application/pm/work-item-parent-rollup.js";
import { createDb } from "../src/persistence/db.js";
import { PmStore } from "../src/persistence/pm-store.js";

describe("rollupParentWorkItemStatuses", () => {
  it("marks parent done when all siblings are done", () => {
    const { db } = createDb(":memory:");
    const pm = new PmStore(db);
    const projectId = uuidv4();
    const parentId = uuidv4();
    const childA = uuidv4();
    const childB = uuidv4();
    const now = new Date().toISOString();

    pm.createWorkItem({
      id: parentId,
      projectId,
      title: "Phase",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    for (const [id, title, status] of [
      [childA, "Task A", "done"],
      [childB, "Task B", "todo"],
    ] as const) {
      pm.createWorkItem({
        id,
        projectId,
        parentId,
        title,
        status,
        priority: 0,
        sortOrder: 0,
        acceptanceCriteria: [],
        dependsOn: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    pm.updateWorkItem(childB, { status: "done" });
    rollupParentWorkItemStatuses(pm, childB);

    expect(pm.getWorkItem(parentId)?.status).toBe("done");
  });
});
