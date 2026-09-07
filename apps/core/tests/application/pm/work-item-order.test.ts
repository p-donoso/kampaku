import { describe, it, expect } from "vitest";
import {
  collectLeavesInOrder,
  dependsOnSatisfied,
  predecessorsComplete,
  projectAutoExecuteKey,
} from "../../../src/application/pm/work-item-order.js";
import type { WorkItemRecord, WorkItemTreeNode } from "../../../src/persistence/pm-store.js";

describe("work-item-order", () => {
  const mockItem = (overrides: Partial<WorkItemRecord> = {}): WorkItemRecord => ({
    id: "item-1",
    projectId: "proj-1",
    title: "Test Item",
    status: "todo",
    priority: 1,
    dependsOn: [],
    complexity: "M",
    acceptanceCriteria: [],
    parentId: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const mockNode = (item: WorkItemRecord, children: WorkItemTreeNode[] = []): WorkItemTreeNode => ({
    item,
    children,
  });

  describe("collectLeavesInOrder", () => {
    it("collects leaf items only", () => {
      const nodes = [
        mockNode(mockItem({ id: "1", title: "Parent" }), [
          mockNode(mockItem({ id: "2", title: "Child 1" })),
          mockNode(mockItem({ id: "3", title: "Child 2" })),
        ]),
      ];
      const leaves = collectLeavesInOrder(nodes);
      expect(leaves).toHaveLength(2);
      expect(leaves[0].id).toBe("2");
      expect(leaves[1].id).toBe("3");
    });

    it("returns empty for empty tree", () => {
      expect(collectLeavesInOrder([])).toEqual([]);
    });

    it("returns root items when no children", () => {
      const nodes = [mockNode(mockItem({ id: "1" }))];
      const leaves = collectLeavesInOrder(nodes);
      expect(leaves).toHaveLength(1);
      expect(leaves[0].id).toBe("1");
    });

    it("flattens nested tree", () => {
      const nodes = [
        mockNode(mockItem({ id: "1" }), [
          mockNode(mockItem({ id: "2" }), [
            mockNode(mockItem({ id: "3" })),
          ]),
        ]),
      ];
      const leaves = collectLeavesInOrder(nodes);
      expect(leaves).toHaveLength(1);
      expect(leaves[0].id).toBe("3");
    });
  });

  describe("dependsOnSatisfied", () => {
    it("returns true when no dependencies", () => {
      const leaf = mockItem({ dependsOn: [] });
      expect(dependsOnSatisfied(leaf, [])).toBe(true);
    });

    it("returns true when all dependencies done", () => {
      const leaf = mockItem({ dependsOn: ["Task A", "Task B"] });
      const items = [
        mockItem({ title: "Task A", status: "done" }),
        mockItem({ title: "Task B", status: "done" }),
      ];
      expect(dependsOnSatisfied(leaf, items)).toBe(true);
    });

    it("returns false when some dependencies not done", () => {
      const leaf = mockItem({ dependsOn: ["Task A", "Task B"] });
      const items = [
        mockItem({ title: "Task A", status: "done" }),
        mockItem({ title: "Task B", status: "todo" }),
      ];
      expect(dependsOnSatisfied(leaf, items)).toBe(false);
    });

    it("returns false when dependency missing", () => {
      const leaf = mockItem({ dependsOn: ["Task A", "Task X"] });
      const items = [mockItem({ title: "Task A", status: "done" })];
      expect(dependsOnSatisfied(leaf, items)).toBe(false);
    });
  });

  describe("predecessorsComplete", () => {
    it("returns true for first item", () => {
      const items = [
        mockItem({ id: "1", status: "todo" }),
        mockItem({ id: "2", status: "todo" }),
      ];
      expect(predecessorsComplete(items[0], items)).toBe(true);
    });

    it("returns true when all predecessors done", () => {
      const items = [
        mockItem({ id: "1", status: "done" }),
        mockItem({ id: "2", status: "done" }),
        mockItem({ id: "3", status: "todo" }),
      ];
      expect(predecessorsComplete(items[2], items)).toBe(true);
    });

    it("returns false when any predecessor not done", () => {
      const items = [
        mockItem({ id: "1", status: "done" }),
        mockItem({ id: "2", status: "todo" }),
        mockItem({ id: "3", status: "todo" }),
      ];
      expect(predecessorsComplete(items[2], items)).toBe(false);
    });

    it("treats cancelled as complete", () => {
      const items = [
        mockItem({ id: "1", status: "cancelled" }),
        mockItem({ id: "2", status: "todo" }),
      ];
      expect(predecessorsComplete(items[1], items)).toBe(true);
    });

    it("returns false when blocked predecessor", () => {
      const items = [
        mockItem({ id: "1", status: "blocked" }),
        mockItem({ id: "2", status: "todo" }),
      ];
      expect(predecessorsComplete(items[1], items)).toBe(false);
    });
  });

  describe("projectAutoExecuteKey", () => {
    it("generates auto-execute key for project", () => {
      expect(projectAutoExecuteKey("proj-123")).toBe("project_auto_execute:proj-123");
    });
  });
});
