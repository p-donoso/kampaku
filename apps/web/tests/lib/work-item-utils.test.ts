import { describe, expect, it } from "vitest";
import {
  buildWorkItemTree,
  canPlayProject,
  countActiveExecutions,
  countFailedItems,
  flattenVisibleWorkItemRows,
  flattenWorkItems,
  rollupWorkItemTree,
} from "@/lib/work-item-utils";
import type { ProjectRosterEntry, WorkItemRecord } from "@/lib/types";

function rosterProject(overrides: Partial<ProjectRosterEntry>): ProjectRosterEntry {
  return {
    id: "project-1",
    slug: "project-1",
    name: "Project 1",
    description: "",
    status: "planning",
    projectLeadSlug: null,
    repositories: [],
    health: "idle",
    activeTasks: 0,
    failedTasks: 0,
    pendingTasks: 1,
    doneTasks: 0,
    totalTasks: 1,
    progressPct: 0,
    pendingQuestions: 0,
    pendingBlockers: 0,
    autoExecute: false,
    executionGated: false,
    lastActivityAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function item(overrides: Partial<WorkItemRecord> & Pick<WorkItemRecord, "id" | "title">): WorkItemRecord {
  return {
    projectId: "project-1",
    status: "todo",
    priority: 0,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("work item utilities", () => {
  it("builds a hierarchy and orders siblings by sortOrder, then priority, then title", () => {
    const tree = buildWorkItemTree([
      item({ id: "low", title: "Low", priority: 1, sortOrder: 2 }),
      item({ id: "beta", title: "Beta", priority: 3, sortOrder: 1 }),
      item({ id: "alpha", title: "Alpha", priority: 3, sortOrder: 0 }),
      item({ id: "child", title: "Child", parentId: "alpha", priority: 2, sortOrder: 0 }),
    ]);

    expect(tree.map((node) => node.item.id)).toEqual(["alpha", "beta", "low"]);
    expect(tree[0].children[0].item.id).toBe("child");
    expect(flattenWorkItems(tree).map((workItem) => workItem.id)).toEqual([
      "alpha",
      "child",
      "beta",
      "low",
    ]);
  });

  it("promotes an item whose parent is absent instead of silently dropping it", () => {
    const tree = buildWorkItemTree([
      item({ id: "orphan", title: "Orphan", parentId: "outside-this-group" }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].item.id).toBe("orphan");
  });

  it("allows play when gated on a blocked task", () => {
    const project = rosterProject({ autoExecute: true, executionGated: true, executionGateReason: "blocked_task" });
    expect(canPlayProject(project, [])).toBe(true);
  });

  it("counts failed and active nested items", () => {
    const tree = buildWorkItemTree([
      item({ id: "group", title: "Group" }),
      item({ id: "blocked", title: "Blocked", parentId: "group", status: "blocked" }),
      item({ id: "running", title: "Running", parentId: "group", executionPhase: "running" }),
      item({ id: "progress", title: "Progress", parentId: "group", status: "in_progress" }),
    ]);

    expect(countFailedItems(tree)).toBe(1);
    expect(countActiveExecutions(tree)).toBe(2);
  });

  it("flattens visible tree rows respecting expand state", () => {
    const tree = buildWorkItemTree([
      item({ id: "group", title: "Group" }),
      item({ id: "child-a", title: "Child A", parentId: "group", sortOrder: 0 }),
      item({ id: "child-b", title: "Child B", parentId: "group", sortOrder: 1 }),
    ]);

    const collapsed = flattenVisibleWorkItemRows(tree, new Set());
    expect(collapsed.map((row) => row.key)).toEqual(["group"]);

    const expanded = flattenVisibleWorkItemRows(tree, new Set(["group"]));
    expect(expanded.map((row) => row.key)).toEqual(["group", "child-a", "child-b"]);
    expect(expanded[1].depth).toBe(1);
  });

  it("rolls parent status up from child tasks", () => {
    const tree = buildWorkItemTree([
      item({ id: "parent", title: "Parent" }),
      item({ id: "child-a", title: "A", parentId: "parent", status: "done" }),
      item({ id: "child-b", title: "B", parentId: "parent", status: "in_progress" }),
    ]);
    const rolled = rollupWorkItemTree(tree);
    expect(rolled[0].item.status).toBe("in_progress");
  });
});
