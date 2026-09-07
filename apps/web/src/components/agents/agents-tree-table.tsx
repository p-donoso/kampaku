"use client";

import { useMemo } from "react";
import { usePanels } from "@/components/panels/panel-provider";
import {
  ACTIVITY_SOURCE_LABELS,
  type AgentSortKey,
  type VisibleAgentRow,
  WORKLOAD_LABELS,
  formatRelativeTime,
} from "@/lib/agent-roster-utils";
import type { AgentRosterNode, AgentWorkload } from "@/lib/types";

const WORKLOAD_STYLES: Record<AgentWorkload, string> = {
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  queued: "bg-warning/15 text-warning border-warning/30",
  idle: "bg-surface text-muted border-border",
  attention: "bg-red-500/15 text-red-400 border-red-500/30",
};

const ROW_BORDER: Record<AgentWorkload, string> = {
  running: "border-l-blue-500",
  queued: "border-l-warning",
  idle: "border-l-border",
  attention: "border-l-red-500",
};

type AgentsTreeTableProps = {
  rows: VisibleAgentRow[];
  sortKey: AgentSortKey;
  sortDesc: boolean;
  searchQuery: string;
  onSort: (key: AgentSortKey) => void;
  onToggleExpand: (slug: string) => void;
};

function SortHeader({
  label,
  column,
  sortKey,
  sortDesc,
  onSort,
  className = "",
}: {
  label: string;
  column: AgentSortKey;
  sortKey: AgentSortKey;
  sortDesc: boolean;
  onSort: (key: AgentSortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`text-left text-xs font-medium uppercase tracking-wide text-muted hover:text-secondary ${className}`}
    >
      {label}
      {active && <span className="ml-1 text-brand">{sortDesc ? "↓" : "↑"}</span>}
    </button>
  );
}

function highlightText(text: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q || !text.toLowerCase().includes(q)) return text;
  const idx = text.toLowerCase().indexOf(q);
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-brand/20 text-brand">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function AgentsTreeTable({
  rows,
  sortKey,
  sortDesc,
  searchQuery,
  onSort,
  onToggleExpand,
}: AgentsTreeTableProps) {
  const { openAgent } = usePanels();
  const now = useMemo(() => Date.now(), []);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
        No agents match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            <th className="px-4 py-3 text-left">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Agent</span>
            </th>
            <th className="px-3 py-3">
              <SortHeader label="Status" column="workload" sortKey={sortKey} sortDesc={sortDesc} onSort={onSort} />
            </th>
            <th className="hidden px-3 py-3 lg:table-cell">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Current task</span>
            </th>
            <th className="hidden px-3 py-3 md:table-cell">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Projects</span>
            </th>
            <th className="px-3 py-3">
              <SortHeader
                label="Tasks"
                column="activeTasks"
                sortKey={sortKey}
                sortDesc={sortDesc}
                onSort={onSort}
              />
            </th>
            <th className="hidden px-3 py-3 sm:table-cell">
              <SortHeader
                label="Learnings"
                column="learnings"
                sortKey={sortKey}
                sortDesc={sortDesc}
                onSort={onSort}
              />
            </th>
            <th className="hidden px-3 py-3 md:table-cell">
              <SortHeader
                label="Last activity"
                column="lastActivity"
                sortKey={sortKey}
                sortDesc={sortDesc}
                onSort={onSort}
              />
            </th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, depth, hasChildren, expanded }) => {
            const { agent, rollup } = node;
            const isManager = hasChildren && rollup;

            return (
              <tr
                key={agent.slug}
                className={`border-b border-border/80 border-l-2 ${ROW_BORDER[agent.workload]} ${
                  agent.status === "archived" ? "opacity-50" : ""
                } ${isManager ? "bg-surface/40" : "hover:bg-elevated/30"}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2" style={{ paddingLeft: depth * 20 }}>
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => onToggleExpand(agent.slug)}
                        aria-expanded={expanded}
                        aria-label={expanded ? "Collapse" : "Expand"}
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-elevated hover:text-foreground"
                      >
                        <span className="text-[10px]">{expanded ? "▼" : "▶"}</span>
                      </button>
                    ) : (
                      <span className="h-5 w-5 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => openAgent(agent.slug)}
                      className="min-w-0 text-left"
                      title={agent.skills.join(", ") || undefined}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground">
                          {highlightText(agent.name, searchQuery)}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {highlightText(agent.slug, searchQuery)}
                        </span>
                        {agent.source === "generated" && (
                          <span className="rounded bg-warning/10 px-1 py-0.5 text-[10px] text-warning">
                            gen
                          </span>
                        )}
                        {agent.source === "bootstrap" && (
                          <span className="rounded bg-violet-500/10 px-1 py-0.5 text-[10px] text-violet-400">
                            boot
                          </span>
                        )}
                      </div>
                      {agent.responsibilities && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                          {highlightText(agent.responsibilities, searchQuery)}
                        </p>
                      )}
                      {isManager && rollup && (
                        <div className="mt-1 text-[10px] text-muted">
                          Team: {rollup.activeTasks} active
                          {rollup.failedTasks > 0 && (
                            <span className="ml-2 text-red-400">{rollup.failedTasks} need attention</span>
                          )}
                        </div>
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${WORKLOAD_STYLES[agent.workload]}`}
                  >
                    {WORKLOAD_LABELS[agent.workload]}
                  </span>
                </td>
                <td className="hidden max-w-[200px] px-3 py-3 lg:table-cell">
                  {agent.currentTask ? (
                    <div className="truncate">
                      <span className="text-secondary">{agent.currentTask.title}</span>
                      <span className="ml-1 text-[10px] text-muted">{agent.currentTask.projectSlug}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {agent.projectSlugs.slice(0, 2).map((slug) => (
                      <span key={slug} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                        {slug}
                      </span>
                    ))}
                    {agent.projectSlugs.length > 2 && (
                      <span className="text-[10px] text-muted">+{agent.projectSlugs.length - 2}</span>
                    )}
                    {agent.projectSlugs.length === 0 && (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={agent.failedTasks > 0 ? "text-red-400" : "text-secondary"}>
                    {agent.activeTasks}/{agent.totalTasks}
                  </span>
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <span className={agent.memoryCounts.learnings > 0 ? "text-violet-400" : "text-muted"}>
                    {agent.memoryCounts.learnings}
                  </span>
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <span
                    title={
                      agent.lastActivityAt
                        ? `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(agent.lastActivityAt))}${agent.lastActivitySource ? ` · ${ACTIVITY_SOURCE_LABELS[agent.lastActivitySource]}` : ""}`
                        : "No activity recorded"
                    }
                    className="text-xs text-muted"
                  >
                    {formatRelativeTime(agent.lastActivityAt, now)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openAgent(agent.slug)}
                    className="text-xs text-brand hover:text-brand-gold"
                  >
                    Details →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type { AgentRosterNode };
