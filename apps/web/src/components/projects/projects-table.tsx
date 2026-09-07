"use client";

import { useMemo } from "react";
import { ProjectExecutionControls } from "@/components/projects/project-execution-controls";
import { WorkItemStatusBadge } from "@/components/execution/execution-status-badges";
import { usePanels } from "@/components/panels/panel-provider";
import {
  HEALTH_DISPLAY,
  formatRelativeTime,
  type ProjectSortKey,
  type VisibleProjectRow,
} from "@/lib/project-roster-utils";
import type { ProjectHealth } from "@/lib/types";

const HEALTH_STYLES: Record<ProjectHealth, string> = {
  attention: "bg-red-500/15 text-red-400 border-red-500/30",
  active: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  idle: "bg-surface text-muted border-border",
};

const ROW_BORDER: Record<ProjectHealth, string> = {
  attention: "border-l-red-500",
  active: "border-l-blue-500",
  idle: "border-l-border",
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
  column: ProjectSortKey;
  sortKey: ProjectSortKey;
  sortDesc: boolean;
  onSort: (key: ProjectSortKey) => void;
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

function ProgressCell({ done, total, pct }: { done: number; total: number; pct: number }) {
  return (
    <div className="min-w-[88px]">
      <div className="mb-1 flex justify-between text-[10px] text-muted">
        <span>
          {done}/{total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
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

function rowBorderClass(row: VisibleProjectRow): string {
  if (row.kind === "project" && row.project) return ROW_BORDER[row.project.health];
  if (row.kind === "task" && row.task) {
    if (row.task.status === "blocked" || row.task.executionPhase === "failed") return "border-l-red-500";
    if (row.task.executionPhase === "running" || row.task.executionPhase === "queued") return "border-l-blue-500";
    if (row.task.status === "done") return "border-l-emerald-600";
    return "border-l-border";
  }
  return "border-l-border";
}

export function ProjectsTable({
  rows,
  sortKey,
  sortDesc,
  searchQuery,
  onSort,
  onToggleExpand,
  onRefresh,
}: {
  rows: VisibleProjectRow[];
  sortKey: ProjectSortKey;
  sortDesc: boolean;
  searchQuery: string;
  onSort: (key: ProjectSortKey) => void;
  onToggleExpand: (key: string) => void;
  onRefresh?: () => void;
}) {
  const { openProject, openAgent, openTask } = usePanels();
  const now = useMemo(() => Date.now(), []);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
        No projects match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            <th className="px-4 py-3 text-left">
              <SortHeader label="Item" column="name" sortKey={sortKey} sortDesc={sortDesc} onSort={onSort} />
            </th>
            <th className="px-3 py-3">
              <SortHeader label="Status" column="health" sortKey={sortKey} sortDesc={sortDesc} onSort={onSort} />
            </th>
            <th className="px-3 py-3">
              <SortHeader label="Progress" column="progress" sortKey={sortKey} sortDesc={sortDesc} onSort={onSort} />
            </th>
            <th className="hidden px-3 py-3 md:table-cell">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Owner</span>
            </th>
            <th className="hidden px-3 py-3 lg:table-cell">
              <SortHeader
                label="Activity"
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
          {rows.map((row) => (
            <tr
              key={row.key}
              className={`border-b border-border/80 border-l-2 ${rowBorderClass(row)} ${
                row.kind === "project" ? "hover:bg-elevated/30" : "bg-surface/20 hover:bg-elevated/20"
              }`}
            >
              <td className="px-4 py-3">
                <div className="flex items-start gap-2" style={{ paddingLeft: row.depth * 20 }}>
                  {row.hasChildren ? (
                    <button
                      type="button"
                      onClick={() => onToggleExpand(row.key)}
                      aria-expanded={row.expanded}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-muted hover:bg-elevated hover:text-foreground"
                    >
                      {row.expanded ? "▼" : "▶"}
                    </button>
                  ) : (
                    <span className="h-5 w-5 shrink-0" />
                  )}

                  {row.kind === "project" && row.project && (
                    <button
                      type="button"
                      onClick={() => openProject(row.project!.slug)}
                      className="min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground">
                          {highlightText(row.project.name, searchQuery)}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {highlightText(row.project.slug, searchQuery)}
                        </span>
                        <span className="rounded bg-surface px-1 py-0.5 text-[10px] text-muted">
                          {row.project.status}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted">{row.project.description}</p>
                    </button>
                  )}

                  {row.kind === "task" && row.task && (
                    <button
                      type="button"
                      onClick={() => openTask(row.task!.id)}
                      className="min-w-0 text-left hover:text-brand"
                    >
                      <span className="text-secondary">{row.task.title}</span>
                      {row.task.description && (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{row.task.description}</p>
                      )}
                    </button>
                  )}
                </div>
              </td>

              <td className="px-3 py-3">
                {row.kind === "project" && row.project && (
                  <>
                    <span
                      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${HEALTH_STYLES[row.project.health]}`}
                    >
                      {HEALTH_DISPLAY[row.project.health]}
                    </span>
                    {row.project.failedTasks > 0 && (
                      <span className="ml-1 text-[10px] text-red-400">
                        {row.project.failedTasks} failed
                      </span>
                    )}
                  </>
                )}
                {row.kind === "task" && row.task && <WorkItemStatusBadge item={row.task} />}
              </td>

              <td className="px-3 py-3">
                {row.kind === "project" && row.project && (
                  <ProgressCell
                    done={row.project.doneTasks}
                    total={row.project.totalTasks}
                    pct={row.project.progressPct}
                  />
                )}
                {row.kind === "task" && <span className="text-xs text-muted">—</span>}
              </td>

              <td className="hidden px-3 py-3 md:table-cell">
                {row.kind === "project" && row.project?.projectLeadSlug && (
                  <button
                    type="button"
                    onClick={() => openAgent(row.project!.projectLeadSlug!)}
                    className="font-mono text-[10px] text-violet-400 hover:text-violet-300"
                  >
                    {row.project.projectLeadSlug}
                  </button>
                )}
                {row.kind === "task" && row.task?.assigneeSlug && (
                  <button
                    type="button"
                    onClick={() => openAgent(row.task!.assigneeSlug!)}
                    className="font-mono text-[10px] text-violet-400 hover:text-violet-300"
                  >
                    {row.task.assigneeSlug}
                  </button>
                )}
                {row.kind === "task" && !row.task?.assigneeSlug && (
                  <span className="text-xs text-muted">—</span>
                )}
                {row.kind === "project" && !row.project?.projectLeadSlug && (
                  <span className="text-xs text-muted">—</span>
                )}
              </td>

              <td className="hidden px-3 py-3 lg:table-cell">
                {row.kind === "project" && row.project && (
                  <span
                    title={
                      row.project.lastActivityAt
                        ? new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(row.project.lastActivityAt))
                        : undefined
                    }
                    className="text-xs text-muted"
                  >
                    {formatRelativeTime(row.project.lastActivityAt, now)}
                  </span>
                )}
                {row.kind === "task" && (
                  <span className="text-xs text-muted">—</span>
                )}
              </td>

              <td className="px-3 py-3 text-right">
                {row.kind === "project" && row.project && (
                  <div className="flex items-center justify-end gap-2">
                    {row.projectTasks && (
                      <ProjectExecutionControls
                        project={row.project}
                        tasks={row.projectTasks}
                        onRefresh={onRefresh}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => openProject(row.project!.slug)}
                      className="text-xs text-brand hover:text-brand-gold"
                    >
                      Details →
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
