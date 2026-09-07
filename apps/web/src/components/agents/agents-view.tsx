"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentsTreeTable } from "@/components/agents/agents-tree-table";
import { getAgentsRoster } from "@/lib/api";
import {
  type AgentFilter,
  type AgentSortKey,
  collectAncestorSlugs,
  collectExpandableSlugs,
  computeFilterCounts,
  filterTree,
  flattenVisibleRows,
  sortSiblingNodes,
} from "@/lib/agent-roster-utils";
import type { AgentRosterNode } from "@/lib/types";
import { useRosterSyncListener } from "@/lib/roster-sync";

function StatPill({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: "red" | "blue" | "violet" | "default";
  active?: boolean;
  onClick?: () => void;
}) {
  const accentClass =
    accent === "red"
      ? "text-red-400"
      : accent === "blue"
        ? "text-blue-400"
        : accent === "violet"
          ? "text-violet-400"
          : "text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        active ? "border-brand/40 bg-brand/5" : "border-border bg-surface/40 hover:bg-elevated/40"
      }`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</div>
    </button>
  );
}

export function AgentsManagement({ initialTree }: { initialTree?: AgentRosterNode[] }) {
  const [tree, setTree] = useState<AgentRosterNode[]>(initialTree ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialTree);
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<AgentSortKey>("workload");
  const [sortDesc, setSortDesc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await getAgentsRoster();
      setTree(res.tree ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useRosterSyncListener(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (tree.length === 0) return;
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      return new Set(collectExpandableSlugs(tree).slice(0, 8));
    });
  }, [tree]);

  const counts = useMemo(() => computeFilterCounts(tree), [tree]);

  const processedTree = useMemo(() => {
    const filtered = filterTree(tree, filter, search);
    return sortSiblingNodes(filtered, sortKey, sortDesc);
  }, [tree, filter, search, sortKey, sortDesc]);

  const rows = useMemo(
    () => flattenVisibleRows(processedTree, expanded),
    [processedTree, expanded],
  );

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      const walk = (nodes: AgentRosterNode[]) => {
        for (const node of nodes) {
          if (
            node.agent.name.toLowerCase().includes(q) ||
            node.agent.slug.toLowerCase().includes(q)
          ) {
            for (const slug of collectAncestorSlugs(tree, node.agent.slug) ?? []) {
              next.add(slug);
            }
            next.add(node.agent.slug);
          }
          walk(node.children);
        }
      };
      walk(tree);
      return next;
    });
  }, [search, tree]);

  function handleSort(key: AgentSortKey) {
    if (sortKey === key) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(key === "lastActivity" || key === "learnings" || key === "activeTasks");
    }
  }

  function expandAll() {
    setExpanded(new Set(collectExpandableSlugs(processedTree)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function toggleExpand(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  if (loading && tree.length === 0) {
    return <p className="text-sm text-muted">Loading agent roster…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatPill label="Total" value={counts.total} active={filter === "all"} onClick={() => setFilter("all")} />
        <StatPill
          label="Busy"
          value={counts.busy}
          accent="blue"
          active={filter === "busy"}
          onClick={() => setFilter(filter === "busy" ? "all" : "busy")}
        />
        <StatPill
          label="Idle"
          value={counts.idle}
          active={filter === "idle"}
          onClick={() => setFilter(filter === "idle" ? "all" : "idle")}
        />
        <StatPill
          label="Needs attention"
          value={counts.attention}
          accent="red"
          active={filter === "attention"}
          onClick={() => setFilter(filter === "attention" ? "all" : "attention")}
        />
        <StatPill
          label="Inactive"
          value={counts.stale}
          active={filter === "stale"}
          onClick={() => setFilter(filter === "stale" ? "all" : "stale")}
        />
        <StatPill
          label="With learnings"
          value={counts.learnings}
          accent="violet"
          active={filter === "learnings"}
          onClick={() => setFilter(filter === "learnings" ? "all" : "learnings")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents…"
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={expandAll}
          className="rounded-lg border border-border px-3 py-2 text-xs text-secondary hover:bg-elevated/40 hover:text-foreground"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-lg border border-border px-3 py-2 text-xs text-secondary hover:bg-elevated/40 hover:text-foreground"
        >
          Collapse all
        </button>
      </div>

      {filter !== "all" && (
        <p className="text-xs text-muted">
          Filtering results ·{" "}
          <button type="button" onClick={() => setFilter("all")} className="text-brand hover:text-brand-gold">
            show all
          </button>
        </p>
      )}

      <AgentsTreeTable
        rows={rows}
        sortKey={sortKey}
        sortDesc={sortDesc}
        searchQuery={search}
        onSort={handleSort}
        onToggleExpand={toggleExpand}
      />
    </div>
  );
}
