import { describe, it, expect } from "vitest";
import type { WorkItemRecord, WorkItemTreeNode } from "@/lib/types";
import {
  getProjectHealth,
  countProjectWorkItems,
  isFailedItem,
  countFailedItems,
  countActiveExecutions,
  countByStatus,
  flattenWorkItems,
  buildWorkItemTree,
  deriveParentWorkItemStatus,
  effectiveWorkItemStatus,
  deriveParentExecutionPhase,
  rollupWorkItemTree,
  buildWorkItemTreeWithRollup,
  collectRosterLeaves,
  hasPendingExecutableTask,
  canPlayProject,
  canRetryWorkItem,
  canRetryWorkItemInTree,
  canPauseProject,
  projectExecutionGateLabel,
  canExecuteWorkItemInTree,
  collectExpandableWorkItemIds,
  flattenVisibleWorkItemRows,
  countDoneLeaves,
  workItemRowBorderClass,
} from "@/lib/work-item-utils";
import type { ProjectRosterEntry, ProjectRosterTaskNode } from "@/lib/types";

describe("work-item-utils", () => {
  const mockItem = (overrides: Partial<WorkItemRecord> = {}): WorkItemRecord => ({
    id: "item-1",
    projectId: "project-1",
    title: "Test Item",
    status: "todo",
    priority: 1,
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const mockNode = (item: WorkItemRecord, children: WorkItemTreeNode[] = []): WorkItemTreeNode => ({
    item,
    children,
  });

  describe("getProjectHealth", () => {
    it("returns attention when failed items exist", () => {
      const nodes = [mockNode(mockItem({ status: "blocked" }))];
      expect(getProjectHealth(nodes)).toBe("attention");
    });

    it("returns active when executions running", () => {
      const nodes = [mockNode(mockItem({ executionPhase: "running" }))];
      expect(getProjectHealth(nodes)).toBe("active");
    });

    it("returns idle when no activity", () => {
      const nodes = [mockNode(mockItem({ status: "todo" }))];
      expect(getProjectHealth(nodes)).toBe("idle");
    });
  });

  describe("countProjectWorkItems", () => {
    it("counts total, done, and pending items", () => {
      const nodes = [
        mockNode(mockItem({ status: "done" })),
        mockNode(mockItem({ status: "todo" })),
        mockNode(mockItem({ status: "done" })),
      ];
      const result = countProjectWorkItems(nodes);
      expect(result).toEqual({ total: 3, done: 2, pending: 1 });
    });
  });

  describe("isFailedItem", () => {
    it("returns true for blocked status", () => {
      expect(isFailedItem(mockItem({ status: "blocked" }))).toBe(true);
    });

    it("returns true for failed execution phase", () => {
      expect(isFailedItem(mockItem({ executionPhase: "failed" }))).toBe(true);
    });

    it("returns false for normal status", () => {
      expect(isFailedItem(mockItem({ status: "todo" }))).toBe(false);
    });
  });

  describe("countFailedItems", () => {
    it("counts failed items recursively", () => {
      const nodes = [
        mockNode(mockItem({ id: "1", status: "blocked" }), [
          mockNode(mockItem({ id: "2", executionPhase: "failed" })),
        ]),
      ];
      expect(countFailedItems(nodes)).toBe(2);
    });
  });

  describe("countActiveExecutions", () => {
    it("counts queued, running, and in_progress items", () => {
      const nodes = [
        mockNode(mockItem({ executionPhase: "queued" })),
        mockNode(mockItem({ executionPhase: "running" })),
        mockNode(mockItem({ status: "in_progress" })),
      ];
      expect(countActiveExecutions(nodes)).toBe(3);
    });
  });

  describe("countByStatus", () => {
    it("counts items matching specified statuses", () => {
      const nodes = [
        mockNode(mockItem({ status: "todo" })),
        mockNode(mockItem({ status: "done" })),
        mockNode(mockItem({ status: "todo" })),
      ];
      expect(countByStatus(nodes, ["todo"])).toBe(2);
      expect(countByStatus(nodes, ["done"])).toBe(1);
    });
  });

  describe("flattenWorkItems", () => {
    it("flattens nested tree to flat array", () => {
      const nodes = [
        mockNode(mockItem({ id: "1" }), [
          mockNode(mockItem({ id: "2" })),
        ]),
      ];
      const flat = flattenWorkItems(nodes);
      expect(flat).toHaveLength(2);
      expect(flat[0].id).toBe("1");
      expect(flat[1].id).toBe("2");
    });
  });

  describe("buildWorkItemTree", () => {
    it("builds tree from flat items", () => {
      const items = [
        mockItem({ id: "1", parentId: null }),
        mockItem({ id: "2", parentId: "1" }),
      ];
      const tree = buildWorkItemTree(items);
      expect(tree).toHaveLength(1);
      expect(tree[0].item.id).toBe("1");
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].item.id).toBe("2");
    });

    it("sorts by sortOrder, priority, and title", () => {
      const items = [
        mockItem({ id: "1", title: "B", priority: 1 }),
        mockItem({ id: "2", title: "A", priority: 2 }),
      ];
      const tree = buildWorkItemTree(items);
      expect(tree[0].item.id).toBe("2");
      expect(tree[1].item.id).toBe("1");
    });
  });

  describe("deriveParentWorkItemStatus", () => {
    it("returns todo for empty children", () => {
      expect(deriveParentWorkItemStatus([])).toBe("todo");
    });

    it("returns blocked if any child blocked", () => {
      expect(deriveParentWorkItemStatus(["done", "blocked", "todo"])).toBe("blocked");
    });

    it("returns done if all children done", () => {
      expect(deriveParentWorkItemStatus(["done", "done"])).toBe("done");
    });

    it("returns in_progress if some done", () => {
      expect(deriveParentWorkItemStatus(["done", "todo"])).toBe("in_progress");
    });
  });

  describe("effectiveWorkItemStatus", () => {
    it("returns status for blocked/cancelled/done", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "blocked" }))).toBe("blocked");
      expect(effectiveWorkItemStatus(mockItem({ status: "cancelled" }))).toBe("cancelled");
      expect(effectiveWorkItemStatus(mockItem({ status: "done" }))).toBe("done");
    });

    it("returns in_progress for running executions", () => {
      expect(effectiveWorkItemStatus(mockItem({ executionPhase: "running" }))).toBe("in_progress");
    });

    it("returns blocked for failed execution", () => {
      expect(effectiveWorkItemStatus(mockItem({ executionPhase: "failed" }))).toBe("blocked");
    });
  });

  describe("deriveParentExecutionPhase", () => {
    it("returns done for done status", () => {
      expect(deriveParentExecutionPhase(["idle"], "done")).toBe("done");
    });

    it("returns failed for blocked status", () => {
      expect(deriveParentExecutionPhase(["idle"], "blocked")).toBe("failed");
    });

    it("returns running if any child running", () => {
      expect(deriveParentExecutionPhase(["running", "idle"], "in_progress")).toBe("running");
    });
  });

  describe("rollupWorkItemTree", () => {
    it("preserves leaf nodes unchanged", () => {
      const nodes = [mockNode(mockItem({ id: "1", status: "todo" }))];
      const rolled = rollupWorkItemTree(nodes);
      expect(rolled[0].item.status).toBe("todo");
    });

    it("rolls up child statuses to parent", () => {
      const nodes = [
        mockNode(mockItem({ id: "1", status: "todo" }), [
          mockNode(mockItem({ id: "2", status: "done" })),
          mockNode(mockItem({ id: "3", status: "done" })),
        ]),
      ];
      const rolled = rollupWorkItemTree(nodes);
      expect(rolled[0].item.status).toBe("done");
    });
  });

  describe("buildWorkItemTreeWithRollup", () => {
    it("builds tree and applies rollup", () => {
      const items = [
        mockItem({ id: "1", parentId: null }),
        mockItem({ id: "2", parentId: "1", status: "done" }),
      ];
      const tree = buildWorkItemTreeWithRollup(items);
      expect(tree[0].item.status).toBe("done");
    });
  });

  describe("collectRosterLeaves", () => {
    it("collects leaf tasks only", () => {
      const tasks: ProjectRosterTaskNode[] = [
        {
          id: "1",
          title: "Parent",
          status: "todo",
          executionPhase: "idle",
          assigneeSlug: null,
          children: [
            { id: "2", title: "Child", status: "todo", executionPhase: "idle", assigneeSlug: null, children: [] },
          ],
        },
      ];
      const leaves = collectRosterLeaves(tasks);
      expect(leaves).toHaveLength(1);
      expect(leaves[0].id).toBe("2");
    });
  });

  describe("hasPendingExecutableTask", () => {
    it("returns false when task in progress", () => {
      const tasks: ProjectRosterTaskNode[] = [
        { id: "1", title: "T1", status: "in_progress", executionPhase: "running", assigneeSlug: null, children: [] },
      ];
      expect(hasPendingExecutableTask(tasks)).toBe(false);
    });

    it("returns true when first pending task is executable", () => {
      const tasks: ProjectRosterTaskNode[] = [
        { id: "1", title: "T1", status: "done", executionPhase: "done", assigneeSlug: null, children: [] },
        { id: "2", title: "T2", status: "todo", executionPhase: "idle", assigneeSlug: null, children: [] },
      ];
      expect(hasPendingExecutableTask(tasks)).toBe(true);
    });
  });

  describe("canPlayProject", () => {
    const mockProject = (overrides: Partial<ProjectRosterEntry> = {}): ProjectRosterEntry => ({
      id: "test-id",
      slug: "test",
      name: "Test Project",
      status: "active",
      description: "",
      health: "idle",
      totalTasks: 5,
      doneTasks: 2,
      failedTasks: 0,
      pendingTasks: 3,
      activeTasks: 0,
      progressPct: 40,
      executionGated: false,
      autoExecute: false,
      pendingQuestions: 0,
      pendingBlockers: 0,
      projectLeadSlug: null,
      lastActivityAt: null,
      updatedAt: new Date().toISOString(),
      ...overrides,
    });

    it("returns false when all tasks done", () => {
      expect(canPlayProject(mockProject({ doneTasks: 5, totalTasks: 5 }), [])).toBe(false);
    });

    it("returns true for blocked gated project", () => {
      expect(canPlayProject(mockProject({ executionGated: true, executionGateReason: "blocked_task" }), [])).toBe(true);
    });

    it("returns false for auto-execute project", () => {
      expect(canPlayProject(mockProject({ autoExecute: true }), [])).toBe(false);
    });
  });

  describe("canRetryWorkItem", () => {
    it("returns true for blocked items", () => {
      expect(canRetryWorkItem(mockItem({ status: "blocked" }))).toBe(true);
    });

    it("returns false for non-blocked items", () => {
      expect(canRetryWorkItem(mockItem({ status: "todo" }))).toBe(false);
    });
  });

  describe("canRetryWorkItemInTree", () => {
    it("returns false if node has children", () => {
      const node = mockNode(mockItem({ status: "blocked" }), [mockNode(mockItem())]);
      expect(canRetryWorkItemInTree(node)).toBe(false);
    });

    it("returns true for blocked leaf", () => {
      const node = mockNode(mockItem({ status: "blocked" }));
      expect(canRetryWorkItemInTree(node)).toBe(true);
    });
  });

  describe("canPauseProject", () => {
    const mockProject = (autoExecute: boolean): ProjectRosterEntry => ({
      id: "test-id",
      slug: "test",
      status: "active",
      name: "Test",
      description: "",
      health: "active",
      totalTasks: 5,
      doneTasks: 2,
      failedTasks: 0,
      pendingTasks: 2,
      activeTasks: 1,
      progressPct: 40,
      autoExecute,
      executionGated: false,
      pendingQuestions: 0,
      pendingBlockers: 0,
      projectLeadSlug: null,
      lastActivityAt: null,
      updatedAt: new Date().toISOString(),
    });

    it("returns true when auto-execute enabled", () => {
      expect(canPauseProject(mockProject(true))).toBe(true);
    });

    it("returns false when auto-execute disabled", () => {
      expect(canPauseProject(mockProject(false))).toBe(false);
    });
  });

  describe("projectExecutionGateLabel", () => {
    const mockProject = (gated: boolean, reason?: "pending_questions" | "pending_blockers" | "blocked_task", detail?: string): ProjectRosterEntry => ({
      id: "test-id",
      slug: "test",
      status: "active",
      name: "Test",
      description: "",
      health: "idle",
      totalTasks: 5,
      doneTasks: 2,
      failedTasks: 0,
      pendingTasks: 3,
      activeTasks: 0,
      progressPct: 40,
      autoExecute: false,
      executionGated: gated,
      executionGateReason: reason,
      executionGateDetail: detail,
      pendingQuestions: 0,
      pendingBlockers: 0,
      projectLeadSlug: null,
      lastActivityAt: null,
      updatedAt: new Date().toISOString(),
    });

    it("returns null when not gated", () => {
      expect(projectExecutionGateLabel(mockProject(false))).toBeNull();
    });

    it("returns label for pending questions", () => {
      expect(projectExecutionGateLabel(mockProject(true, "pending_questions", "3 questions"))).toBe("3 questions");
    });

    it("returns default label when detail missing", () => {
      expect(projectExecutionGateLabel(mockProject(true, "pending_questions"))).toBe("Pending questions");
    });

    it("returns blocked label", () => {
      expect(projectExecutionGateLabel(mockProject(true, "blocked_task", "API error"))).toBe("Blocked: API error");
    });
  });

  describe("canExecuteWorkItemInTree", () => {
    it("returns false if node has children", () => {
      const node = mockNode(mockItem({ status: "todo" }), [mockNode(mockItem())]);
      expect(canExecuteWorkItemInTree(node, [node])).toBe(false);
    });

    it("returns false for done items", () => {
      const node = mockNode(mockItem({ status: "done" }));
      expect(canExecuteWorkItemInTree(node, [node])).toBe(false);
    });

    it("returns true for first todo item", () => {
      const node = mockNode(mockItem({ id: "1", status: "todo" }));
      expect(canExecuteWorkItemInTree(node, [node])).toBe(true);
    });

    it("returns false when previous item not done", () => {
      const node1 = mockNode(mockItem({ id: "1", status: "todo" }));
      const node2 = mockNode(mockItem({ id: "2", status: "todo" }));
      expect(canExecuteWorkItemInTree(node2, [node1, node2])).toBe(false);
    });
  });

  describe("collectExpandableWorkItemIds", () => {
    it("collects IDs of nodes with children", () => {
      const nodes = [
        mockNode(mockItem({ id: "1" }), [mockNode(mockItem({ id: "2" }))]),
      ];
      const ids = collectExpandableWorkItemIds(nodes);
      expect(ids).toEqual(["1"]);
    });
  });

  describe("flattenVisibleWorkItemRows", () => {
    it("flattens tree to visible rows", () => {
      const nodes = [mockNode(mockItem({ id: "1" }))];
      const rows = flattenVisibleWorkItemRows(nodes, new Set());
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toBe("1");
    });

    it("expands nodes in expanded set", () => {
      const nodes = [
        mockNode(mockItem({ id: "1" }), [mockNode(mockItem({ id: "2" }))]),
      ];
      const rows = flattenVisibleWorkItemRows(nodes, new Set(["1"]));
      expect(rows).toHaveLength(2);
    });
  });

  describe("countDoneLeaves", () => {
    it("counts done and total leaves", () => {
      const nodes = [
        mockNode(mockItem({ id: "1" }), [
          mockNode(mockItem({ id: "2", status: "done" })),
          mockNode(mockItem({ id: "3", status: "todo" })),
        ]),
      ];
      const result = countDoneLeaves(nodes);
      expect(result).toEqual({ done: 1, total: 2 });
    });
  });

  describe("workItemRowBorderClass", () => {
    it("returns red for blocked items", () => {
      const node = mockNode(mockItem({ status: "blocked" }));
      expect(workItemRowBorderClass(node)).toBe("border-l-red-500");
    });

    it("returns blue for running items", () => {
      const node = mockNode(mockItem({ executionPhase: "running" }));
      expect(workItemRowBorderClass(node)).toBe("border-l-blue-500");
    });

    it("returns emerald for done items", () => {
      const node = mockNode(mockItem({ status: "done" }));
      expect(workItemRowBorderClass(node)).toBe("border-l-emerald-600");
    });

    it("returns zinc-600 for parents", () => {
      const node = mockNode(mockItem(), [mockNode(mockItem())]);
      expect(workItemRowBorderClass(node)).toBe("border-l-zinc-600");
    });
  });
});
