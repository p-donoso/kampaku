import { describe, it, expect } from "vitest";
import {
  deriveParentWorkItemStatus,
  effectiveWorkItemStatus,
  deriveParentExecutionPhase,
  buildPendingEscalationWorkItemIds,
} from "../../../src/application/pm/work-item-status-rollup.js";
import type { WorkItemRecord, WorkItemStatus } from "../../../src/persistence/pm-store.js";
import type { ExecutionPhase } from "../../../src/application/pm/execution-status.js";

describe("work-item-status-rollup", () => {
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

  describe("deriveParentWorkItemStatus", () => {
    it("throws for empty children array", () => {
      expect(() => deriveParentWorkItemStatus([])).toThrow("requires at least one child");
    });

    it("returns blocked when any child blocked", () => {
      const statuses: WorkItemStatus[] = ["done", "blocked", "todo"];
      expect(deriveParentWorkItemStatus(statuses)).toBe("blocked");
    });

    it("returns in_progress when any child in_progress", () => {
      const statuses: WorkItemStatus[] = ["done", "in_progress", "todo"];
      expect(deriveParentWorkItemStatus(statuses)).toBe("in_progress");
    });

    it("returns done when all children done", () => {
      const statuses: WorkItemStatus[] = ["done", "done", "done"];
      expect(deriveParentWorkItemStatus(statuses)).toBe("done");
    });

    it("returns cancelled when all children cancelled", () => {
      const statuses: WorkItemStatus[] = ["cancelled", "cancelled"];
      expect(deriveParentWorkItemStatus(statuses)).toBe("cancelled");
    });

    it("returns in_progress when some done and some todo", () => {
      const statuses: WorkItemStatus[] = ["done", "todo"];
      expect(deriveParentWorkItemStatus(statuses)).toBe("in_progress");
    });

    it("returns backlog when all children backlog", () => {
      const statuses: WorkItemStatus[] = ["backlog", "backlog"];
      expect(deriveParentWorkItemStatus(statuses)).toBe("backlog");
    });

    it("returns todo for all todo", () => {
      const statuses: WorkItemStatus[] = ["todo", "todo"];
      expect(deriveParentWorkItemStatus(statuses)).toBe("todo");
    });
  });

  describe("effectiveWorkItemStatus", () => {
    it("returns blocked for blocked status", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "blocked" }))).toBe("blocked");
    });

    it("returns cancelled for cancelled status", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "cancelled" }))).toBe("cancelled");
    });

    it("returns done for done status", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "done" }))).toBe("done");
    });

    it("returns in_progress for in_progress status", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "in_progress" }))).toBe("in_progress");
    });

    it("returns in_progress for running execution", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "todo" }), "running")).toBe("in_progress");
    });

    it("returns in_progress for queued execution", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "todo" }), "queued")).toBe("in_progress");
    });

    it("returns blocked for failed execution", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "todo" }), "failed")).toBe("blocked");
    });

    it("returns original status for idle execution", () => {
      expect(effectiveWorkItemStatus(mockItem({ status: "todo" }), "idle")).toBe("todo");
    });
  });

  describe("deriveParentExecutionPhase", () => {
    it("returns done for done status", () => {
      const phases: ExecutionPhase[] = ["idle", "done"];
      expect(deriveParentExecutionPhase(phases, "done")).toBe("done");
    });

    it("returns failed for blocked status", () => {
      const phases: ExecutionPhase[] = ["idle"];
      expect(deriveParentExecutionPhase(phases, "blocked")).toBe("failed");
    });

    it("returns running when any child running", () => {
      const phases: ExecutionPhase[] = ["idle", "running", "done"];
      expect(deriveParentExecutionPhase(phases, "in_progress")).toBe("running");
    });

    it("returns queued when any child queued", () => {
      const phases: ExecutionPhase[] = ["idle", "queued"];
      expect(deriveParentExecutionPhase(phases, "in_progress")).toBe("queued");
    });

    it("returns failed when any child failed", () => {
      const phases: ExecutionPhase[] = ["idle", "failed"];
      expect(deriveParentExecutionPhase(phases, "in_progress")).toBe("failed");
    });

    it("returns done when all children done", () => {
      const phases: ExecutionPhase[] = ["done", "done", "done"];
      expect(deriveParentExecutionPhase(phases, "in_progress")).toBe("done");
    });

    it("returns idle for empty phases", () => {
      const phases: ExecutionPhase[] = [];
      expect(deriveParentExecutionPhase(phases, "todo")).toBe("idle");
    });
  });

  describe("buildPendingEscalationWorkItemIds", () => {
    it("builds set from pending records", () => {
      const records = [
        { workItemId: "wi-1" },
        { workItemId: "wi-2" },
        { workItemId: undefined },
      ];
      const ids = buildPendingEscalationWorkItemIds(records);
      expect(ids.size).toBe(2);
      expect(ids.has("wi-1")).toBe(true);
      expect(ids.has("wi-2")).toBe(true);
    });

    it("returns empty set for empty array", () => {
      const ids = buildPendingEscalationWorkItemIds([]);
      expect(ids.size).toBe(0);
    });

    it("excludes records without workItemId", () => {
      const records = [{ workItemId: undefined }, {}];
      const ids = buildPendingEscalationWorkItemIds(records);
      expect(ids.size).toBe(0);
    });
  });
});
