"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FailedCountBadge } from "@/components/execution-status";
import { ProjectHeaderStatus } from "@/components/project-header-status";
import { JournalEntryCard } from "@/components/work-item-journal-timeline";
import type { ProjectAgentEntry } from "@/lib/agent-project-links";
import { getProjectExecution, getProjectJournal, getProjectsRoster, getWikiTree } from "@/lib/api";
import type { ProjectOverview, ProjectRosterEntry, WorkItemJournalEntry } from "@/lib/types";
import {
  countActiveExecutions,
  countByStatus,
  countDoneLeaves,
  countFailedItems,
  flattenWorkItems,
  getProjectHealth,
} from "@/lib/work-item-utils";

export type ProjectDetailTab = "summary" | "tasks" | "journal" | "wiki" | "agents";

const HEALTH_LABELS = {
  attention: "Needs attention",
  active: "Active",
  idle: "Idle",
} as const;

const HEALTH_STYLES = {
  attention: "bg-red-500/15 text-red-400 border-red-500/30",
  active: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  idle: "bg-zinc-800 text-zinc-500 border-zinc-700",
} as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SummaryCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function TabLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-amber-500 hover:text-amber-400"
    >
      {label} →
    </button>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn" ? "text-red-400" : tone === "ok" ? "text-emerald-400" : "text-zinc-200";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function ProjectSummaryPanel({
  overview,
  projectAgents,
  onNavigateTab,
}: {
  overview: ProjectOverview;
  projectAgents: ProjectAgentEntry[];
  onNavigateTab: (tab: ProjectDetailTab) => void;
}) {
  const { project, workItems } = overview;
  const [rosterEntry, setRosterEntry] = useState<ProjectRosterEntry | null>(null);
  const [execution, setExecution] = useState<Awaited<ReturnType<typeof getProjectExecution>> | null>(null);
  const [journalEntries, setJournalEntries] = useState<WorkItemJournalEntry[]>([]);
  const [wikiStats, setWikiStats] = useState<{
    pageCount: number;
    pendingCount: number;
    hasRoadmap: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const health = useMemo(() => getProjectHealth(workItems), [workItems]);
  const failedCount = useMemo(() => countFailedItems(workItems), [workItems]);
  const activeCount = useMemo(() => countActiveExecutions(workItems), [workItems]);
  const leafProgress = useMemo(() => countDoneLeaves(workItems), [workItems]);
  const flatItems = useMemo(() => flattenWorkItems(workItems), [workItems]);
  const blockedCount = useMemo(() => countByStatus(workItems, ["blocked"]), [workItems]);
  const inProgressCount = useMemo(
    () => countByStatus(workItems, ["in_progress"]) + activeCount,
    [workItems, activeCount],
  );

  const leadAgent = projectAgents.find((entry) => entry.role === "lead")?.agent;
  const progressPct =
    leafProgress.total > 0 ? Math.round((leafProgress.done / leafProgress.total) * 100) : 0;

  const currentTasks = useMemo(
    () =>
      flatItems
        .filter(
          (item) =>
            item.executionPhase === "running" ||
            item.executionPhase === "queued" ||
            item.status === "in_progress",
        )
        .slice(0, 3),
    [flatItems],
  );

  const loadSummary = useCallback(async () => {
    const [rosterRes, executionRes, journalRes, wikiRes] = await Promise.all([
      getProjectsRoster().catch(() => null),
      getProjectExecution(project.slug).catch(() => null),
      getProjectJournal(project.id, "?limit=5").catch(() => ({ entries: [] })),
      getWikiTree(project.slug).catch(() => null),
    ]);

    const roster =
      rosterRes?.projects.find((node) => node.project.slug === project.slug)?.project ?? null;
    setRosterEntry(roster);
    setExecution(executionRes);
    setJournalEntries(journalRes.entries.slice(0, 5));
    setWikiStats(
      wikiRes
        ? {
            pageCount: wikiRes.pageCount,
            pendingCount: wikiRes.pendingCount,
            hasRoadmap: wikiRes.hasRoadmap,
          }
        : null,
    );
  }, [project.id, project.slug]);

  useEffect(() => {
    setLoading(true);
    loadSummary().finally(() => setLoading(false));
  }, [loadSummary]);

  const attentionItems: string[] = [];
  if (failedCount > 0) attentionItems.push(`${failedCount} failed or blocked task(s)`);
  if (rosterEntry?.pendingQuestions) {
    attentionItems.push(`${rosterEntry.pendingQuestions} pending question(s)`);
  }
  if (rosterEntry?.pendingBlockers) {
    attentionItems.push(`${rosterEntry.pendingBlockers} pending blocker(s)`);
  }
  if (wikiStats?.pendingCount) {
    attentionItems.push(`${wikiStats.pendingCount} wiki edit(s) awaiting approval`);
  }
  if (execution?.gated && execution.gate.detail) {
    attentionItems.push(execution.gate.detail);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
          {project.status}
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] ${HEALTH_STYLES[health]}`}>
          {HEALTH_LABELS[health]}
        </span>
        {execution?.autoExecute && (
          <span className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300">
            Auto-executing
          </span>
        )}
        <FailedCountBadge count={failedCount} compact />
        <ProjectHeaderStatus projectSlug={project.slug} initialWorkItems={workItems} />
      </div>

      {project.description && (
        <p className="text-sm leading-relaxed text-zinc-400">{project.description}</p>
      )}

      {attentionItems.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-medium text-amber-300">Attention</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-100/80">
            {attentionItems.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          title="Tasks"
          action={<TabLink label="Open tasks" onClick={() => onNavigateTab("tasks")} />}
        >
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-[10px] text-zinc-600">
              <span>
                {leafProgress.done}/{leafProgress.total} leaf tasks done
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500/70 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatPill label="Total" value={flatItems.length} />
            <StatPill label="In progress" value={inProgressCount} />
            <StatPill label="Blocked" value={blockedCount} tone={blockedCount > 0 ? "warn" : "default"} />
            <StatPill label="Done" value={leafProgress.done} tone="ok" />
          </div>
          {currentTasks.length > 0 && (
            <div className="mt-3 border-t border-zinc-800 pt-3">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-600">Running now</p>
              <ul className="space-y-1 text-xs text-zinc-400">
                {currentTasks.map((task) => (
                  <li key={task.id} className="truncate">
                    {task.title}
                    {task.assigneeSlug ? ` · ${task.assigneeSlug}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SummaryCard>

        <SummaryCard title="Execution">
          {loading && !execution ? (
            <p className="text-xs text-zinc-600">Loading…</p>
          ) : execution ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Mode</dt>
                <dd className="text-zinc-200">{execution.autoExecute ? "Automatic" : "Manual"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Gate</dt>
                <dd className={execution.gated ? "text-amber-400" : "text-emerald-400"}>
                  {execution.gated
                    ? (execution.gate.detail ?? execution.gate.reason ?? "Gated")
                    : "Clear"}
                </dd>
              </div>
              {rosterEntry?.currentTask && (
                <div className="border-t border-zinc-800 pt-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-600">Current focus</p>
                  <p className="mt-1 text-xs text-zinc-300">{rosterEntry.currentTask.title}</p>
                  {rosterEntry.currentTask.assigneeSlug && (
                    <p className="text-[10px] text-zinc-500">{rosterEntry.currentTask.assigneeSlug}</p>
                  )}
                </div>
              )}
            </dl>
          ) : (
            <p className="text-xs text-zinc-600">Execution state unavailable.</p>
          )}
        </SummaryCard>

        <SummaryCard title="Metadata">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Slug</dt>
              <dd className="font-mono text-xs text-zinc-300">{project.slug}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Lead</dt>
              <dd className="text-zinc-200">{leadAgent?.name ?? rosterEntry?.projectLeadSlug ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Agents</dt>
              <dd className="text-zinc-200">{projectAgents.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Repositories</dt>
              <dd className="text-zinc-200">{project.repositories.length}</dd>
            </div>
            {project.repositories.length > 0 && (
              <ul className="space-y-1 border-t border-zinc-800 pt-2 font-mono text-[10px] text-zinc-400">
                {project.repositories.map((repo) => (
                  <li key={repo.url} className="break-all">
                    {repo.url.replace(/^file:\/\//, "")}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Created</dt>
              <dd className="text-zinc-200">{formatDate(project.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Updated</dt>
              <dd className="text-zinc-200">{formatDate(project.updatedAt)}</dd>
            </div>
          </dl>
          {project.coherenceStrategy && (
            <p className="mt-3 line-clamp-3 border-t border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-500">
              {project.coherenceStrategy}
            </p>
          )}
          {wikiStats?.hasRoadmap && (
            <p className="mt-2 text-[10px] text-zinc-600">
              Roadmap synced to{" "}
              <button
                type="button"
                onClick={() => onNavigateTab("wiki")}
                className="text-amber-500 hover:text-amber-400"
              >
                wiki
              </button>
              .
            </p>
          )}
        </SummaryCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          title="Journal"
          action={<TabLink label="Full journal" onClick={() => onNavigateTab("journal")} />}
        >
          {loading && journalEntries.length === 0 ? (
            <p className="text-xs text-zinc-600">Loading recent activity…</p>
          ) : journalEntries.length === 0 ? (
            <p className="text-xs text-zinc-600">No journal entries yet.</p>
          ) : (
            <ul className="space-y-3">
              {journalEntries.map((entry) => (
                <JournalEntryCard key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </SummaryCard>

        <div className="space-y-4">
          <SummaryCard
            title="Wiki"
            action={<TabLink label="Open wiki" onClick={() => onNavigateTab("wiki")} />}
          >
            {wikiStats ? (
              <div className="grid grid-cols-2 gap-2">
                <StatPill label="Pages" value={wikiStats.pageCount} />
                <StatPill
                  label="Pending edits"
                  value={wikiStats.pendingCount}
                  tone={wikiStats.pendingCount > 0 ? "warn" : "default"}
                />
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Wiki stats unavailable.</p>
            )}
            {wikiStats?.hasRoadmap && (
              <p className="mt-3 text-xs text-zinc-500">
                Includes a synced <span className="text-zinc-300">roadmap</span> page with milestones
                and coherence strategy.
              </p>
            )}
          </SummaryCard>

          <SummaryCard
            title="Team"
            action={<TabLink label="All agents" onClick={() => onNavigateTab("agents")} />}
          >
            {projectAgents.length === 0 ? (
              <p className="text-xs text-zinc-600">No agents assigned.</p>
            ) : (
              <ul className="space-y-2">
                {projectAgents.slice(0, 4).map(({ agent, role, taskCount }) => (
                  <li key={agent.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-zinc-200">{agent.name}</span>
                      {role === "lead" && (
                        <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                          Lead
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-600">
                      {taskCount} task{taskCount !== 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
                {projectAgents.length > 4 && (
                  <li className="text-[10px] text-zinc-600">+{projectAgents.length - 4} more</li>
                )}
              </ul>
            )}
          </SummaryCard>
        </div>
      </div>
    </div>
  );
}
