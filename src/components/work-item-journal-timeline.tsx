"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getProjectJournal } from "@/lib/api";
import type { JournalEntryKind, WorkItemJournalEntry, WorkItemTreeNode } from "@/lib/types";
import { flattenWorkItems } from "@/lib/work-item-utils";

const KIND_LABELS: Record<JournalEntryKind, string> = {
  delegation: "Delegation",
  completion_report: "Completion report",
  question_raised: "Question",
  question_answered: "Answer",
  question_escalated: "Question escalated",
  blocker_reported: "Blocker",
  blocker_resolved: "Blocker resolved",
  blocker_delegated: "Blocker delegated",
  blocker_escalated: "Blocker escalated",
  blocker_converted: "Blocker converted",
  audit_proposal: "Audit proposal",
};

const KIND_COLORS: Record<JournalEntryKind, string> = {
  delegation: "border-blue-500/60 bg-blue-500/10 text-blue-200",
  completion_report: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  question_raised: "border-amber-500/60 bg-amber-500/10 text-amber-200",
  question_answered: "border-teal-500/60 bg-teal-500/10 text-teal-200",
  question_escalated: "border-orange-500/60 bg-orange-500/10 text-orange-200",
  blocker_reported: "border-red-500/60 bg-red-500/10 text-red-200",
  blocker_resolved: "border-green-500/60 bg-green-500/10 text-green-200",
  blocker_delegated: "border-violet-500/60 bg-violet-500/10 text-violet-200",
  blocker_escalated: "border-orange-500/60 bg-orange-500/10 text-orange-200",
  blocker_converted: "border-pink-500/60 bg-pink-500/10 text-pink-200",
  audit_proposal: "border-cyan-500/60 bg-cyan-500/10 text-cyan-200",
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function agentLabel(agent?: { slug: string; name: string }): string {
  if (!agent) return "unknown";
  return agent.name !== agent.slug ? `${agent.name} (${agent.slug})` : agent.slug;
}

export const DELEGATE_JOURNAL_KINDS =
  "completion_report,question_raised,question_answered,question_escalated,blocker_reported,blocker_resolved,blocker_delegated,blocker_escalated,blocker_converted";

export function JournalEntryCard({ entry }: { entry: WorkItemJournalEntry }) {
  const [expanded, setExpanded] = useState(false);
  const preview = entry.body.length > 180 && !expanded ? `${entry.body.slice(0, 180)}…` : entry.body;

  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-2 h-2.5 w-2.5 rounded-full bg-muted ring-4 ring-background" />
      <article className="rounded-lg border border-border bg-surface/40 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_COLORS[entry.kind]}`}
          >
            {KIND_LABELS[entry.kind]}
          </span>
          <span className="text-xs text-muted">{formatRelativeTime(entry.occurredAt)}</span>
        </div>
        <h4 className="text-sm font-medium text-foreground">{entry.title}</h4>
        <p className="mt-1 text-xs text-muted">
          Task: {entry.workItem.title}
          {entry.fromAgent ? ` · from ${agentLabel(entry.fromAgent)}` : ""}
          {entry.toAgent ? ` → ${agentLabel(entry.toAgent)}` : ""}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-secondary">{preview}</p>
        {entry.body.length > 180 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-2 text-xs text-muted hover:text-foreground"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </article>
    </li>
  );
}

export function WorkItemJournalTimeline({
  projectId,
  workItems,
}: {
  projectId: string;
  workItems: WorkItemTreeNode[];
}) {
  const flatItems = useMemo(() => flattenWorkItems(workItems), [workItems]);
  const [entries, setEntries] = useState<WorkItemJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workItemFilter, setWorkItemFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<JournalEntryKind | "">("");

  const load = useCallback(async () => {
    try {
      const kinds = kindFilter ? kindFilter : undefined;
      const query = new URLSearchParams();
      if (workItemFilter) query.set("workItemId", workItemFilter);
      if (kinds) query.set("kinds", kinds);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const data = await getProjectJournal(projectId, suffix);
      setEntries(data.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, workItemFilter, kindFilter]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Anchor task
          <select
            value={workItemFilter}
            onChange={(e) => setWorkItemFilter(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">All tasks</option>
            {flatItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Event type
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as JournalEntryKind | "")}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">All types</option>
            {(Object.keys(KIND_LABELS) as JournalEntryKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && entries.length === 0 && (
        <p className="text-sm text-muted">Loading journal…</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-muted">No journal entries yet.</p>
      )}

      <ol className="ml-1 space-y-4 border-l border-border">
        {entries.map((entry) => (
          <JournalEntryCard key={entry.id} entry={entry} />
        ))}
      </ol>
    </section>
  );
}
