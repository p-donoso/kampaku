"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectsTable } from "@/components/projects-table";
import { getProjectsRoster } from "@/lib/api";
import {
  type ProjectFilter,
  type ProjectSortKey,
  collectProjectExpandableKeys,
  computeFilterCounts,
  filterTreeNodes,
  flattenVisibleProjectRows,
  sortTreeNodes,
} from "@/lib/project-roster-utils";
import type { ProjectRosterTreeNode } from "@/lib/types";
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
  accent?: "red" | "blue" | "amber" | "default";
  active?: boolean;
  onClick?: () => void;
}) {
  const accentClass =
    accent === "red"
      ? "text-red-400"
      : accent === "blue"
        ? "text-blue-400"
        : accent === "amber"
          ? "text-warning"
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

export function ProjectsManagement({
  initialProjects,
  compact = false,
  limit,
}: {
  initialProjects?: ProjectRosterTreeNode[];
  compact?: boolean;
  limit?: number;
}) {
  const [tree, setTree] = useState<ProjectRosterTreeNode[]>(initialProjects ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialProjects);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ProjectSortKey>("health");
  const [sortDesc, setSortDesc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await getProjectsRoster();
      setTree(res.projects ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
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

  const counts = useMemo(() => computeFilterCounts(tree), [tree]);

  const visibleRows = useMemo(() => {
    let nodes = filterTreeNodes(tree, filter, search);
    nodes = sortTreeNodes(nodes, sortKey, sortDesc);
    if (limit) nodes = nodes.slice(0, limit);
    return flattenVisibleProjectRows(nodes, expanded, !compact);
  }, [tree, filter, search, sortKey, sortDesc, limit, expanded, compact]);

  function handleSort(key: ProjectSortKey) {
    if (sortKey === key) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(key === "progress" || key === "activeTasks" || key === "lastActivity");
    }
  }

  function handleToggleExpand(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(collectProjectExpandableKeys(tree)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  if (loading && tree.length === 0) {
    return <p className="text-sm text-muted">Loading projects…</p>;
  }

  if (tree.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm text-muted">No projects registered.</p>
        <Link href="/chat" className="mt-2 inline-block text-xs text-brand hover:text-brand-gold">
          Create one from chat →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatPill label="Total" value={counts.total} active={filter === "all"} onClick={() => setFilter("all")} />
          <StatPill
            label="Needs attention"
            value={counts.attention}
            accent="red"
            active={filter === "attention"}
            onClick={() => setFilter(filter === "attention" ? "all" : "attention")}
          />
          <StatPill
            label="Running"
            value={counts.active}
            accent="blue"
            active={filter === "active"}
            onClick={() => setFilter(filter === "active" ? "all" : "active")}
          />
          <StatPill
            label="Idle"
            value={counts.idle}
            active={filter === "idle"}
            onClick={() => setFilter(filter === "idle" ? "all" : "idle")}
          />
          <StatPill
            label="Questions"
            value={counts.questions}
            accent="amber"
            active={filter === "questions"}
            onClick={() => setFilter(filter === "questions" ? "all" : "questions")}
          />
          <StatPill
            label="Inactive"
            value={counts.stale}
            active={filter === "stale"}
            onClick={() => setFilter(filter === "stale" ? "all" : "stale")}
          />
        </div>
      )}

      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
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
            Collapse
          </button>
        </div>
      )}

      {filter !== "all" && !compact && (
        <p className="text-xs text-muted">
          Filtering results ·{" "}
          <button type="button" onClick={() => setFilter("all")} className="text-brand hover:text-brand-gold">
            show all
          </button>
        </p>
      )}

      <ProjectsTable
        rows={visibleRows}
        sortKey={sortKey}
        sortDesc={sortDesc}
        searchQuery={search}
        onSort={handleSort}
        onToggleExpand={handleToggleExpand}
        onRefresh={refresh}
      />

      {compact && limit && tree.length > limit && (
        <Link href="/projects" className="block text-center text-xs text-brand hover:text-brand-gold">
          View all projects →
        </Link>
      )}
    </div>
  );
}

export function DashboardProjectsOverview({
  initialProjects,
}: {
  initialProjects?: ProjectRosterTreeNode[];
}) {
  return <ProjectsManagement initialProjects={initialProjects} compact limit={5} />;
}
