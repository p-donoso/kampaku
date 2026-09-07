"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailTabNav } from "@/components/panels/detail-tab-nav";
import { ExecutePlayButton } from "@/components/execution/execute-play-button";
import { GoalAuditContent } from "@/components/work-items/goal-audit-panel";
import { WorkItemStatusBadge } from "@/components/execution/execution-status-badges";
import {
  DELEGATE_JOURNAL_KINDS,
  JournalEntryCard,
} from "@/components/work-items/work-item-journal-timeline";
import { usePanels } from "@/components/panels/panel-provider";
import { getWorkItemJournal, getReportingStatus, executeWorkItem, retryWorkItem } from "@/lib/api";
import type { WorkItemChildSummary, WorkItemDetail, WorkItemJournalEntry } from "@/lib/types";

type Tab = "summary" | "children" | "journal" | "job";

export type WorkItemTab = Tab;

const STATUS_OPTIONS = ["backlog", "todo", "in_progress", "blocked", "done", "cancelled"] as const;

const detailInputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50";

const detailTextareaClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500/50";

const STATUS_BADGE_STYLES: Record<string, string> = {
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  in_progress: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  blocked: "border-red-500/30 bg-red-500/10 text-red-400",
  cancelled: "border-zinc-700 bg-zinc-800 text-zinc-500",
  todo: "border-zinc-700 bg-zinc-800 text-zinc-500",
  backlog: "border-zinc-700 bg-zinc-800 text-zinc-500",
};

function TaskJournalTab({ workItemId }: { workItemId: string }) {
  const [entries, setEntries] = useState<WorkItemJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getWorkItemJournal(workItemId);
      setEntries(data.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading && entries.length === 0) {
    return <p className="text-sm text-zinc-500">Loading journal…</p>;
  }
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">No journal entries.</p>;
  }

  return (
    <ol className="space-y-4 border-l border-zinc-800 ml-1">
      {entries.map((entry) => (
        <JournalEntryCard key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

export function ReportingStatusPanel({ workItemId, projectId, agentSlug }: { workItemId: string; projectId: string; agentSlug?: string }) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { void getReportingStatus(workItemId, { projectId, agentSlug }).then(setStatus).catch(() => setStatus(null)); }, [workItemId, projectId, agentSlug]);
  if (!status) return null;
  const ready = status.readyForClosure === true;
  const missing = Array.isArray(status.missing) ? status.missing.join(", ") : "none";
  return <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs"><div className="flex items-center justify-between"><span className="font-medium text-zinc-300">Reporting projection</span><span className={ready ? "text-emerald-400" : "text-amber-400"}>{ready ? "Ready" : `Missing: ${missing}`}</span></div><p className="mt-1 text-zinc-500">Superior journal, private memory, and shared wiki evidence are tracked separately.</p></div>;
}

function SubtasksTab({
  workItemId,
  subtasks,
  onOpenTask,
}: {
  workItemId: string;
  subtasks: WorkItemChildSummary[];
  onOpenTask: (id: string) => void;
}) {
  const childIds = useMemo(() => new Set(subtasks.map((child) => child.id)), [subtasks]);
  const [entries, setEntries] = useState<WorkItemJournalEntry[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await getWorkItemJournal(
        workItemId,
        `?kinds=${encodeURIComponent(DELEGATE_JOURNAL_KINDS)}`,
      );
      setEntries(data.entries);
      setMessagesError(null);
    } catch (e) {
      setMessagesError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMessages(false);
    }
  }, [workItemId]);

  useEffect(() => {
    setLoadingMessages(true);
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 5000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  const delegateMessages = useMemo(
    () =>
      entries.filter((entry) => childIds.size === 0 || childIds.has(entry.workItem.id)),
    [entries, childIds],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {subtasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No subtasks.</p>
        ) : (
          subtasks.map((child) => (
            <div
              key={child.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
            >
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${STATUS_BADGE_STYLES[child.status] ?? STATUS_BADGE_STYLES.todo}`}
              >
                {child.status}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{child.title}</span>
              <button
                type="button"
                onClick={() => onOpenTask(child.id)}
                className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-amber-500/40 hover:text-amber-400"
              >
                Open
              </button>
            </div>
          ))
        )}
      </div>

      {(loadingMessages || messagesError || delegateMessages.length > 0) && (
        <section className="space-y-3 border-t border-zinc-800 pt-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Delegate updates
          </h4>
          {loadingMessages && delegateMessages.length === 0 && (
            <p className="text-sm text-zinc-500">Loading updates…</p>
          )}
          {messagesError && <p className="text-sm text-red-400">{messagesError}</p>}
          {!loadingMessages && !messagesError && delegateMessages.length === 0 && (
            <p className="text-sm text-zinc-500">No reports, blockers, or questions yet.</p>
          )}
          {delegateMessages.length > 0 && (
            <ol className="space-y-4 border-l border-zinc-800 ml-1">
              {delegateMessages.map((entry) => (
                <JournalEntryCard key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

export type WorkItemDraft = {
  title: string;
  description: string;
  status: string;
  priority: number;
  parentId: string;
};

export function WorkItemDetailTabs({
  detail,
  editing = false,
  draft,
  onDraftChange,
  onRefresh,
  initialTab = "summary",
}: {
  detail: WorkItemDetail;
  editing?: boolean;
  draft?: WorkItemDraft;
  onDraftChange?: (patch: Partial<WorkItemDraft>) => void;
  onRefresh?: () => void;
  initialTab?: WorkItemTab;
}) {
  const { openProject, openAgent, openTask } = usePanels();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [executing, setExecuting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { item, project, parent, children } = detail;
  const isLeaf = children.length === 0;
  const canExecute =
    isLeaf &&
    item.status !== "done" &&
    item.status !== "cancelled" &&
    item.status !== "in_progress" &&
    item.status !== "blocked" &&
    item.executionPhase !== "queued" &&
    item.executionPhase !== "running";
  const canRetry = isLeaf && item.status === "blocked";

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "summary", label: "Summary" },
    { id: "children", label: "Subtasks", count: children.length || undefined },
    { id: "journal", label: "Journal" },
    ...(item.goalId ? [{ id: "job" as const, label: "Job" }] : []),
  ];

  useEffect(() => {
    setTab(initialTab);
  }, [detail.item.id, initialTab]);

  async function handleExecute() {
    setExecuting(true);
    try {
      await executeWorkItem(item.id);
      onRefresh?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to run task");
    } finally {
      setExecuting(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryWorkItem(item.id);
      onRefresh?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to retry");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-6 py-2">
        <span className="text-xs text-zinc-500">Task ID</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">{item.id}</code>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(item.id)}
          className="shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        >
          Copy
        </button>
      </div>
      <DetailTabNav tabs={tabs} active={tab} onChange={setTab} ariaLabel="Task detail" />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tab === "summary" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {canExecute && (
                <ExecutePlayButton
                  onClick={handleExecute}
                  loading={executing}
                  title={`Run: ${item.title}`}
                />
              )}
              {canRetry && (
                <ExecutePlayButton
                  onClick={handleRetry}
                  loading={retrying}
                  title={`Retry: ${item.title}`}
                />
              )}
              <WorkItemStatusBadge item={item} />
            </div>

            {editing && draft && onDraftChange ? (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-500">Title</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => onDraftChange({ title: e.target.value })}
                    className={detailInputClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-500">Description</span>
                  <textarea
                    value={draft.description}
                    onChange={(e) => onDraftChange({ description: e.target.value })}
                    rows={4}
                    className={detailTextareaClass}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <label className="space-y-1">
                    <span className="text-xs text-zinc-500">Status</span>
                    <select
                      value={draft.status}
                      onChange={(e) => onDraftChange({ status: e.target.value })}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-zinc-500">Priority</span>
                    <input
                      type="number"
                      value={draft.priority}
                      onChange={(e) => onDraftChange({ priority: Number(e.target.value) })}
                      className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                    />
                  </label>
                  <label className="min-w-[12rem] flex-1 space-y-1">
                    <span className="text-xs text-zinc-500">Parent</span>
                    <select
                      value={draft.parentId}
                      onChange={(e) => onDraftChange({ parentId: e.target.value })}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                    >
                      <option value="">No parent (root)</option>
                      {detail.projectTasks
                        .filter((t) => t.id !== item.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : (
              <>
                {item.description && (
                  <p className="whitespace-pre-wrap text-sm text-zinc-300">{item.description}</p>
                )}
                <ReportingStatusPanel workItemId={item.id} projectId={item.projectId} agentSlug={item.assigneeSlug} />
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-zinc-500">Project</dt>
                    <dd>
                      <button
                        type="button"
                        onClick={() => openProject(project.slug)}
                        className="text-amber-500 hover:text-amber-400"
                      >
                        {project.name}
                      </button>
                    </dd>
                  </div>
                  {parent && (
                    <div>
                      <dt className="text-xs text-zinc-500">Parent task</dt>
                      <dd>
                        <button
                          type="button"
                          onClick={() => openTask(parent.id)}
                          className="text-amber-500 hover:text-amber-400"
                        >
                          {parent.title}
                        </button>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-zinc-500">Priority</dt>
                    <dd className="text-zinc-300">{item.priority}</dd>
                  </div>
                  {item.complexity && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-zinc-500">Complexity budget</dt>
                      <dd className="font-mono text-xs text-zinc-300">
                        {item.complexity.role === "container"
                          ? `${item.complexity.granularity} · ${item.complexity.leafCount}/${item.complexity.targetLeaves} leaves (min ${item.complexity.minLeaves}) · depth ${item.complexity.depth}`
                          : `${item.complexity.granularity} · ${item.complexity.filesUsed}/${item.complexity.filesMax} files · ${item.complexity.scriptsUsed}/${item.complexity.scriptsMax} scripts · ${item.complexity.descriptionChars}/${item.complexity.minDescriptionChars} chars · depth ${item.complexity.depth}`}
                      </dd>
                    </div>
                  )}
                  {item.assigneeSlug && (
                    <div>
                      <dt className="text-xs text-zinc-500">Assignee</dt>
                      <dd>
                        <button
                          type="button"
                          onClick={() => openAgent(item.assigneeSlug!)}
                          className="text-amber-500 hover:text-amber-400"
                        >
                          {item.assigneeSlug}
                        </button>
                      </dd>
                    </div>
                  )}
                  {item.routingReason && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-zinc-500">Routing</dt>
                      <dd className="text-zinc-400">{item.routingReason}</dd>
                    </div>
                  )}
                </dl>
                {item.dependsOn.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs text-zinc-500">Depends on</h4>
                    <ul className="list-inside list-disc text-sm text-zinc-400">
                      {item.dependsOn.map((dep) => (
                        <li key={dep}>{dep}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.acceptanceCriteria.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs text-zinc-500">Acceptance criteria</h4>
                    <ul className="list-inside list-disc text-sm text-zinc-400">
                      {item.acceptanceCriteria.map((criterion) => (
                        <li key={criterion}>{criterion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "children" && (
          <SubtasksTab workItemId={item.id} subtasks={children} onOpenTask={openTask} />
        )}

        {tab === "journal" && <TaskJournalTab workItemId={item.id} />}

        {tab === "job" && item.goalId && (
          <GoalAuditContent goalId={item.goalId} compact />
        )}
      </div>
    </div>
  );
}
