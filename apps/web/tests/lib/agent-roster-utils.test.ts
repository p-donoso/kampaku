import { describe, it, expect } from "vitest";
import type { AgentRosterEntry, AgentRosterNode } from "@/lib/types";
import {
  isStale,
  isBusy,
  matchesFilter,
  nodeMatchesSearch,
  subtreeMatchesFilter,
  sortSiblingNodes,
  filterTree,
  collectExpandableSlugs,
  collectAncestorSlugs,
  flattenVisibleRows,
  countAgents,
  flattenAgents,
  computeFilterCounts,
  formatRelativeTime,
  WORKLOAD_LABELS,
  ACTIVITY_SOURCE_LABELS,
} from "@/lib/agent-roster-utils";

describe("agent-roster-utils", () => {
  const mockAgent = (overrides: Partial<AgentRosterEntry> = {}): AgentRosterEntry => ({
    slug: "test-agent",
    name: "Test Agent",
    responsibilities: "Testing",
    skills: ["test"],
    workload: "idle",
    activeTasks: 0,
    failedTasks: 0,
    memoryCounts: { learnings: 0, questions: 0, blockers: 0 },
    lastActivityAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    ...overrides,
  });

  const mockNode = (agent: AgentRosterEntry, children: AgentRosterNode[] = []): AgentRosterNode => ({
    agent,
    children,
  });

  describe("isStale", () => {
    it("returns true for null lastActivityAt", () => {
      expect(isStale(mockAgent({ lastActivityAt: null }))).toBe(true);
    });

    it("returns true for old activity", () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(isStale(mockAgent({ lastActivityAt: old }))).toBe(true);
    });

    it("returns false for recent activity", () => {
      const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      expect(isStale(mockAgent({ lastActivityAt: recent }))).toBe(false);
    });
  });

  describe("isBusy", () => {
    it("returns true for running workload", () => {
      expect(isBusy(mockAgent({ workload: "running" }))).toBe(true);
    });

    it("returns true for queued workload", () => {
      expect(isBusy(mockAgent({ workload: "queued" }))).toBe(true);
    });

    it("returns false for idle workload", () => {
      expect(isBusy(mockAgent({ workload: "idle" }))).toBe(false);
    });
  });

  describe("matchesFilter", () => {
    it("matches all filter", () => {
      expect(matchesFilter(mockAgent(), "all")).toBe(true);
    });

    it("matches busy filter", () => {
      expect(matchesFilter(mockAgent({ workload: "running" }), "busy")).toBe(true);
      expect(matchesFilter(mockAgent({ workload: "idle" }), "busy")).toBe(false);
    });

    it("matches idle filter", () => {
      expect(matchesFilter(mockAgent({ workload: "idle" }), "idle")).toBe(true);
    });

    it("matches attention filter", () => {
      expect(matchesFilter(mockAgent({ workload: "attention" }), "attention")).toBe(true);
      expect(matchesFilter(mockAgent({ failedTasks: 1 }), "attention")).toBe(true);
    });

    it("matches stale filter", () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      expect(matchesFilter(mockAgent({ lastActivityAt: old }), "stale")).toBe(true);
    });

    it("matches learnings filter", () => {
      expect(matchesFilter(mockAgent({ memoryCounts: { learnings: 3, questions: 0, blockers: 0 } }), "learnings")).toBe(true);
      expect(matchesFilter(mockAgent({ memoryCounts: { learnings: 0, questions: 0, blockers: 0 } }), "learnings")).toBe(false);
    });
  });

  describe("nodeMatchesSearch", () => {
    it("matches empty query", () => {
      expect(nodeMatchesSearch(mockNode(mockAgent()), "")).toBe(true);
    });

    it("matches name", () => {
      expect(nodeMatchesSearch(mockNode(mockAgent({ name: "Alice" })), "alice")).toBe(true);
    });

    it("matches slug", () => {
      expect(nodeMatchesSearch(mockNode(mockAgent({ slug: "alice-agent" })), "alice")).toBe(true);
    });

    it("matches responsibilities", () => {
      expect(nodeMatchesSearch(mockNode(mockAgent({ responsibilities: "Database admin" })), "database")).toBe(true);
    });

    it("matches skills", () => {
      expect(nodeMatchesSearch(mockNode(mockAgent({ skills: ["python", "typescript"] })), "python")).toBe(true);
    });

    it("does not match irrelevant query", () => {
      expect(nodeMatchesSearch(mockNode(mockAgent({ name: "Alice" })), "bob")).toBe(false);
    });
  });

  describe("subtreeMatchesFilter", () => {
    it("matches when self matches", () => {
      const node = mockNode(mockAgent({ workload: "running" }));
      expect(subtreeMatchesFilter(node, "busy", "")).toBe(true);
    });

    it("matches when child matches", () => {
      const node = mockNode(mockAgent({ workload: "idle" }), [
        mockNode(mockAgent({ workload: "running" })),
      ]);
      expect(subtreeMatchesFilter(node, "busy", "")).toBe(true);
    });

    it("does not match when no match in tree", () => {
      const node = mockNode(mockAgent({ workload: "idle" }));
      expect(subtreeMatchesFilter(node, "busy", "")).toBe(false);
    });
  });

  describe("sortSiblingNodes", () => {
    it("sorts by workload", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "a1", workload: "idle" })),
        mockNode(mockAgent({ slug: "a2", workload: "running" })),
      ];
      const sorted = sortSiblingNodes(nodes, "workload", false);
      expect(sorted[0].agent.slug).toBe("a2");
    });

    it("sorts by activeTasks", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "a1", activeTasks: 5 })),
        mockNode(mockAgent({ slug: "a2", activeTasks: 2 })),
      ];
      const sorted = sortSiblingNodes(nodes, "activeTasks", false);
      expect(sorted[0].agent.slug).toBe("a2");
    });

    it("sorts by learnings", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "a1", memoryCounts: { learnings: 10, questions: 0, blockers: 0 } })),
        mockNode(mockAgent({ slug: "a2", memoryCounts: { learnings: 3, questions: 0, blockers: 0 } })),
      ];
      const sorted = sortSiblingNodes(nodes, "learnings", false);
      expect(sorted[0].agent.slug).toBe("a2");
    });

    it("sorts descending when specified", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "a1", activeTasks: 2 })),
        mockNode(mockAgent({ slug: "a2", activeTasks: 5 })),
      ];
      const sorted = sortSiblingNodes(nodes, "activeTasks", true);
      expect(sorted[0].agent.slug).toBe("a2");
    });
  });

  describe("filterTree", () => {
    it("filters tree by filter and query", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "a1", name: "Alice", workload: "running" })),
        mockNode(mockAgent({ slug: "a2", name: "Bob", workload: "idle" })),
      ];
      const filtered = filterTree(nodes, "busy", "");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].agent.slug).toBe("a1");
    });

    it("preserves children when parent or child matches", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "parent", workload: "idle" }), [
          mockNode(mockAgent({ slug: "child", workload: "running" })),
        ]),
      ];
      const filtered = filterTree(nodes, "busy", "");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].agent.slug).toBe("parent");
    });
  });

  describe("collectExpandableSlugs", () => {
    it("collects slugs of nodes with children", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "parent" }), [
          mockNode(mockAgent({ slug: "child" })),
        ]),
      ];
      const slugs = collectExpandableSlugs(nodes);
      expect(slugs).toContain("parent");
      expect(slugs).not.toContain("child");
    });
  });

  describe("collectAncestorSlugs", () => {
    it("collects ancestors of target", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "grandparent" }), [
          mockNode(mockAgent({ slug: "parent" }), [
            mockNode(mockAgent({ slug: "child" })),
          ]),
        ]),
      ];
      const ancestors = collectAncestorSlugs(nodes, "child");
      expect(ancestors).toEqual(["grandparent", "parent"]);
    });

    it("returns empty for root", () => {
      const nodes = [mockNode(mockAgent({ slug: "root" }))];
      const ancestors = collectAncestorSlugs(nodes, "root");
      expect(ancestors).toEqual([]);
    });

    it("returns null for not found", () => {
      const nodes = [mockNode(mockAgent({ slug: "root" }))];
      const ancestors = collectAncestorSlugs(nodes, "nonexistent");
      expect(ancestors).toBeNull();
    });
  });

  describe("flattenVisibleRows", () => {
    it("flattens tree to visible rows", () => {
      const nodes = [mockNode(mockAgent({ slug: "a1" }))];
      const rows = flattenVisibleRows(nodes, new Set());
      expect(rows).toHaveLength(1);
      expect(rows[0].node.agent.slug).toBe("a1");
    });

    it("expands nodes in expanded set", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "parent" }), [
          mockNode(mockAgent({ slug: "child" })),
        ]),
      ];
      const rows = flattenVisibleRows(nodes, new Set(["parent"]));
      expect(rows).toHaveLength(2);
      expect(rows[1].depth).toBe(1);
    });
  });

  describe("countAgents", () => {
    it("counts all agents in tree", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "a1" }), [
          mockNode(mockAgent({ slug: "a2" })),
        ]),
      ];
      expect(countAgents(nodes)).toBe(2);
    });
  });

  describe("flattenAgents", () => {
    it("flattens agents from tree", () => {
      const nodes = [
        mockNode(mockAgent({ slug: "a1" }), [
          mockNode(mockAgent({ slug: "a2" })),
        ]),
      ];
      const flat = flattenAgents(nodes);
      expect(flat).toHaveLength(2);
      expect(flat[0].slug).toBe("a1");
      expect(flat[1].slug).toBe("a2");
    });
  });

  describe("computeFilterCounts", () => {
    it("computes filter counts", () => {
      const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const nodes = [
        mockNode(mockAgent({ slug: "a1", workload: "running", lastActivityAt: recent })),
        mockNode(mockAgent({ slug: "a2", workload: "idle", lastActivityAt: recent })),
        mockNode(mockAgent({ slug: "a3", workload: "attention", failedTasks: 1, lastActivityAt: recent })),
        mockNode(mockAgent({ slug: "a4", workload: "queued", lastActivityAt: old })),
        mockNode(mockAgent({ slug: "a5", workload: "idle", memoryCounts: { learnings: 5, questions: 0, blockers: 0 }, lastActivityAt: recent })),
      ];
      const counts = computeFilterCounts(nodes);
      expect(counts.total).toBe(5);
      expect(counts.busy).toBe(2);
      expect(counts.idle).toBe(2);
      expect(counts.attention).toBe(1);
      expect(counts.stale).toBe(1);
      expect(counts.learnings).toBe(1);
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
      expect(formatRelativeTime(new Date(now - 10 * 60 * 1000).toISOString(), now)).toBe("10m ago");
    });
  });

  describe("WORKLOAD_LABELS", () => {
    it("has labels for all workload states", () => {
      expect(WORKLOAD_LABELS.running).toBe("Running");
      expect(WORKLOAD_LABELS.queued).toBe("Queued");
      expect(WORKLOAD_LABELS.idle).toBe("Idle");
      expect(WORKLOAD_LABELS.attention).toBe("Needs attention");
    });
  });

  describe("ACTIVITY_SOURCE_LABELS", () => {
    it("has labels for activity sources", () => {
      expect(ACTIVITY_SOURCE_LABELS.work_item).toBe("task");
      expect(ACTIVITY_SOURCE_LABELS.delegation).toBe("delegation");
      expect(ACTIVITY_SOURCE_LABELS.memory).toBe("memory");
      expect(ACTIVITY_SOURCE_LABELS.conversation).toBe("conversation");
    });
  });
});
