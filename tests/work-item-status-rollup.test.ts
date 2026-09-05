import { describe, expect, it } from "vitest";
import type { WorkItemRecord, WorkItemTreeNode } from "../../persistence/pm-store.js";
import {
  applyWorkItemStatusRollup,
  deriveParentExecutionPhase,
  deriveParentWorkItemStatus,
  effectiveWorkItemStatus,
  subtreeHasPendingEscalation,
} from "../src/application/pm/work-item-status-rollup.js";

function item(overrides: Partial<WorkItemRecord> & Pick<WorkItemRecord, "id" | "title">): WorkItemRecord {
  return {
    projectId: "project-1",
    status: "todo",
    priority: 0,
    sortOrder: 0,
    acceptanceCriteria: [],
    dependsOn: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function node(
  workItem: WorkItemRecord,
  children: WorkItemTreeNode[] = [],
): WorkItemTreeNode {
  return { item: workItem, children };
}

describe("work item status rollup", () => {
  it("marks parent done when every child is done", () => {
    expect(deriveParentWorkItemStatus(["done", "done"])).toBe("done");
  });

  it("marks parent in progress when any child is in progress", () => {
    expect(deriveParentWorkItemStatus(["done", "in_progress", "todo"])).toBe("in_progress");
  });

  it("marks parent blocked when any child is blocked", () => {
    expect(deriveParentWorkItemStatus(["done", "blocked"])).toBe("blocked");
  });

  it("marks parent in progress when work is partially complete", () => {
    expect(deriveParentWorkItemStatus(["done", "todo"])).toBe("in_progress");
  });

  it("treats running execution as in progress", () => {
    const leaf = item({ id: "leaf", title: "Leaf", status: "todo" });
    expect(effectiveWorkItemStatus(leaf, "running")).toBe("in_progress");
  });

  it("rolls up parent status from nested children", () => {
    const tree = [
      node(item({ id: "parent", title: "Parent" }), [
        node(item({ id: "child-a", title: "A", status: "done" })),
        node(item({ id: "child-b", title: "B", status: "done" })),
      ]),
    ];

    const rolled = applyWorkItemStatusRollup(tree);
    expect(rolled[0].item.status).toBe("done");
  });

  it("forces blocked rollup when a descendant has a pending escalation", () => {
    const tree = [
      node(item({ id: "parent", title: "Parent" }), [
        node(item({ id: "child", title: "Child", status: "todo" }), [
          node(item({ id: "leaf", title: "Leaf", status: "in_progress" })),
        ]),
      ]),
    ];

    const rolled = applyWorkItemStatusRollup(tree, new Set(["leaf"]));
    expect(rolled[0].item.status).toBe("blocked");
    expect(subtreeHasPendingEscalation(tree[0], new Set(["leaf"]))).toBe(true);
  });

  it("derives parent execution phase from active children", () => {
    expect(deriveParentExecutionPhase(["running", "idle"], "in_progress")).toBe("running");
    expect(deriveParentExecutionPhase(["done", "done"], "done")).toBe("done");
    expect(deriveParentExecutionPhase(["failed", "idle"], "blocked")).toBe("failed");
  });
});
