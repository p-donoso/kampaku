// @ts-nocheck
import { describe, it, expect } from "vitest";
import type { ProjectRosterEntry, ProjectRosterTreeNode } from "@/lib/types";
import {
  projectExpandKey,
  taskExpandKey,
  extractProjects,
  isStale,
  matchesFilter,
  matchesSearch,
  sortTreeNodes,
  filterTreeNodes,
  computeFilterCounts,
  flattenVisibleProjectRows,
  collectProjectExpandableKeys,
  formatRelativeTime,
  HEALTH_LABELS,
  HEALTH_DISPLAY,
} from "@/lib/project-roster-utils";

describe("project-roster-utils", () => {
  const mockProject = (overrides: Partial<ProjectRosterEntry> = {}): ProjectRosterEntry => ({
    slug: "test-project",
    name: "Test Project",
    description: "A test project",
    health: "idle",
    totalTasks: 5,
    doneTasks: 2,
    activeTasks: 0,
    progressPct: 40,
    executionGated: false,
    autoExecute: false,
    pendingQuestions: 0,
    pendingBlockers: 0,
    projectLeadSlug: null,
    lastActivityAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const mockTreeNode = (project: ProjectRosterEntry): ProjectRosterTreeNode => ({
    project,
    tasks: [],
  });

  describe("projectExpandKey", () => {
    it("generates project expand key", () => {
      expect(projectExpandKey("my-project")).toBe("p:my-project");
    });
  });

  describe("taskExpandKey", () => {
    it("generates task expand key", () => {
      expect(taskExpandKey("task-123")).toBe("t:task-123");
    });
  });

  describe("extractProjects", () => {
    it("extracts projects from tree nodes", () => {
      const nodes = [mockTreeNode(mockProject({ slug: "p1" })), mockTreeNode(mockProject({ slug: "p2" }))];
      const projects = extractProjects(nodes);
      expect(projects).toHaveLength(2);
      expect(projects[0].slug).toBe("p1");
    });
  });

  describe("isStale", () => {
    it("returns true for null lastActivityAt", () => {
      expect(isStale(mockProject({ lastActivityAt: null }))).toBe(true);
    });

    it("returns true for old activity", () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(isStale(mockProject({ lastActivityAt: old }))).toBe(true);
    });

    it("returns false for recent activity", () => {
      const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      expect(isStale(mockProject({ lastActivityAt: recent }))).toBe(false);
    });
  });

  describe("matchesFilter", () => {
    it("matches all filter", () => {
      expect(matchesFilter(mockProject(), "all")).toBe(true);
    });

    it("matches health filter", () => {
      expect(matchesFilter(mockProject({ health: "active" }), "active")).toBe(true);
      expect(matchesFilter(mockProject({ health: "idle" }), "active")).toBe(false);
    });

    it("matches questions filter", () => {
      expect(matchesFilter(mockProject({ pendingQuestions: 3 }), "questions")).toBe(true);
      expect(matchesFilter(mockProject({ pendingQuestions: 0 }), "questions")).toBe(false);
    });

    it("matches stale filter", () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(matchesFilter(mockProject({ lastActivityAt: old, health: "idle" }), "stale")).toBe(true);
      expect(matchesFilter(mockProject({ lastActivityAt: old, health: "active" }), "stale")).toBe(false);
    });
  });

  describe("matchesSearch", () => {
    it("matches empty query", () => {
      expect(matchesSearch(mockProject(), "")).toBe(true);
    });

    it("matches name", () => {
      expect(matchesSearch(mockProject({ name: "My Project" }), "project")).toBe(true);
    });

    it("matches slug", () => {
      expect(matchesSearch(mockProject({ slug: "my-project" }), "project")).toBe(true);
    });

    it("matches description", () => {
      expect(matchesSearch(mockProject({ description: "Important work" }), "important")).toBe(true);
    });

    it("does not match irrelevant query", () => {
      expect(matchesSearch(mockProject({ name: "Project A" }), "xyz")).toBe(false);
    });
  });

  describe("sortTreeNodes", () => {
    it("sorts by health", () => {
      const nodes = [
        mockTreeNode(mockProject({ slug: "p1", health: "idle" })),
        mockTreeNode(mockProject({ slug: "p2", health: "attention" })),
      ];
      const sorted = sortTreeNodes(nodes, "health", false);
      expect(sorted[0].project.slug).toBe("p2");
    });

    it("sorts by progress", () => {
      const nodes = [
        mockTreeNode(mockProject({ slug: "p1", progressPct: 80 })),
        mockTreeNode(mockProject({ slug: "p2", progressPct: 40 })),
      ];
      const sorted = sortTreeNodes(nodes, "progress", false);
      expect(sorted[0].project.slug).toBe("p2");
    });

    it("sorts by activeTasks", () => {
      const nodes = [
        mockTreeNode(mockProject({ slug: "p1", activeTasks: 5 })),
        mockTreeNode(mockProject({ slug: "p2", activeTasks: 2 })),
      ];
      const sorted = sortTreeNodes(nodes, "activeTasks", false);
      expect(sorted[0].project.slug).toBe("p2");
    });

    it("sorts descending when specified", () => {
      const nodes = [
        mockTreeNode(mockProject({ slug: "p1", progressPct: 40 })),
        mockTreeNode(mockProject({ slug: "p2", progressPct: 80 })),
      ];
      const sorted = sortTreeNodes(nodes, "progress", true);
      expect(sorted[0].project.slug).toBe("p2");
    });
  });

  describe("filterTreeNodes", () => {
    it("filters by filter and query", () => {
      const nodes = [
        mockTreeNode(mockProject({ slug: "p1", name: "Project A", health: "active" })),
        mockTreeNode(mockProject({ slug: "p2", name: "Project B", health: "idle" })),
      ];
      const filtered = filterTreeNodes(nodes, "active", "");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].project.slug).toBe("p1");
    });

    it("filters by search query", () => {
      const nodes = [
        mockTreeNode(mockProject({ slug: "p1", name: "Alpha" })),
        mockTreeNode(mockProject({ slug: "p2", name: "Beta" })),
      ];
      const filtered = filterTreeNodes(nodes, "all", "alpha");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].project.slug).toBe("p1");
    });
  });

  describe("computeFilterCounts", () => {
    it("computes filter counts", () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const nodes = [
        mockTreeNode(mockProject({ health: "attention", pendingQuestions: 1 })),
        mockTreeNode(mockProject({ health: "active" })),
        mockTreeNode(mockProject({ health: "idle", lastActivityAt: old })),
      ];
      const counts = computeFilterCounts(nodes);
      expect(counts.total).toBe(3);
      expect(counts.attention).toBe(1);
      expect(counts.active).toBe(1);
      expect(counts.idle).toBe(1);
      expect(counts.questions).toBe(1);
      expect(counts.stale).toBe(1);
    });
  });

  describe("flattenVisibleProjectRows", () => {
    it("flattens project rows", () => {
      const nodes = [mockTreeNode(mockProject({ slug: "p1" }))];
      const rows = flattenVisibleProjectRows(nodes, new Set(), true);
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe("project");
    });

    it("expands projects with tasks", () => {
      const nodes = [
        {
          project: mockProject({ slug: "p1" }),
          tasks: [{ id: "t1", title: "Task 1", status: "todo", executionPhase: "idle", children: [] }],
        },
      ];
      const rows = flattenVisibleProjectRows(nodes as ProjectRosterTreeNode[], new Set(["p:p1"]), true);
      expect(rows.length).toBeGreaterThan(1);
    });
  });

  describe("collectProjectExpandableKeys", () => {
    it("collects expandable keys", () => {
      const nodes = [
        {
          project: mockProject({ slug: "p1" }),
          tasks: [{ id: "t1", title: "Task 1", status: "todo", executionPhase: "idle", children: [] }],
        },
      ];
      const keys = collectProjectExpandableKeys(nodes as ProjectRosterTreeNode[]);
      expect(keys).toContain("p:p1");
    });
  });

  describe("formatRelativeTime", () => {
    it("formats null as no activity", () => {
      expect(formatRelativeTime(null)).toBe("no activity");
    });

    it("formats just now", () => {
      const now = Date.now();
      expect(formatRelativeTime(new Date(now - 30000).toISOString(), now)).toBe("just now");
    });

    it("formats minutes ago", () => {
      const now = Date.now();
      expect(formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe("5m ago");
    });

    it("formats hours ago", () => {
      const now = Date.now();
      expect(formatRelativeTime(new Date(now - 3 * 60 * 60 * 1000).toISOString(), now)).toBe("3h ago");
    });

    it("formats days ago", () => {
      const now = Date.now();
      expect(formatRelativeTime(new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe("5d ago");
    });
  });

  describe("HEALTH_LABELS", () => {
    it("has labels for all health states", () => {
      expect(HEALTH_LABELS.attention).toBe("Needs attention");
      expect(HEALTH_LABELS.active).toBe("Running");
      expect(HEALTH_LABELS.idle).toBe("Idle");
    });
  });

  describe("HEALTH_DISPLAY", () => {
    it("has display labels for all health states", () => {
      expect(HEALTH_DISPLAY.attention).toBe("Needs attention");
      expect(HEALTH_DISPLAY.active).toBe("Running");
      expect(HEALTH_DISPLAY.idle).toBe("Idle");
    });
  });
});
