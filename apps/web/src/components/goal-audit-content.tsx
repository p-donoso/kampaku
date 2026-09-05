"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getGoalAudit } from "@/lib/api";
import { JobControlActions } from "@/components/job-control-actions";
import { elapsedMsSince, formatElapsedMs } from "@/lib/job-elapsed";
import type { GoalAudit } from "@/lib/types";

const JOB_STATUS_COLORS: Record<string, string> = {
  queued: "text-amber-400",
  leased: "text-blue-400",
  running: "text-blue-400",
  paused: "text-amber-300",
  succeeded: "text-emerald-400",
  failed: "text-red-400",
  cancelled: "text-zinc-500",
  expired: "text-red-400",
};

const ACTIVE_JOB_STATUSES = new Set(["queued", "leased", "running"]);

function JobRunCard({
  job,
  result,
  defaultExpanded,
  workItemId,
  onJobChanged,
}: {
  job: GoalAudit["jobs"][number];
  result?: GoalAudit["results"][number];
  defaultExpanded: boolean;
  workItemId?: string | null;
  onJobChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const logs = job.logs ?? [];
  const isActive = ACTIVE_JOB_STATUSES.has(job.status);
  const startedAt = job.startedAt ?? logs[0]?.occurredAt;
  const elapsed = elapsedMsSince(startedAt, now);

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  useEffect(() => {
    if (!expanded || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [expanded, logs.length, logs[logs.length - 1]?.line]);

  const statusLabel = result ? `${job.status} → ${result.status}` : job.status;

  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="rounded-lg border border-zinc-800/80 bg-zinc-950/50"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 marker:content-none">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-zinc-400">{job.id.slice(0, 8)}…</span>
          <span className={`text-xs ${JOB_STATUS_COLORS[job.status] ?? "text-zinc-500"}`}>
            {statusLabel}
          </span>
          {isActive && elapsed !== null && (
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-300">
              {formatElapsedMs(elapsed)}
            </span>
          )}
          {!isActive && elapsed !== null && (
            <span className="text-[10px] text-zinc-600">{formatElapsedMs(elapsed)} total</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <JobControlActions
            jobId={job.id}
            jobStatus={job.status}
            workItemId={workItemId}
            onChanged={onJobChanged}
          />
          <span className="text-[10px] text-zinc-600">{expanded ? "Hide log" : "Show log"}</span>
        </div>
      </summary>

      <div className="border-t border-zinc-800/80 px-3 py-3">
        {isActive && logs.length === 0 && (
          <p className="mb-2 text-xs text-zinc-500">
            Waiting for worker output. If this stays empty, the worker may be starting or blocked on the model API.
          </p>
        )}
        <div
          ref={logRef}
          className="max-h-64 overflow-y-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-300"
        >
          {logs.length === 0 ? (
            <span className="text-zinc-600">No log lines yet.</span>
          ) : (
            logs.map((entry, index) => (
              <div key={`${entry.occurredAt}-${index}`} className="whitespace-pre-wrap break-words">
                <span className="text-zinc-600">
                  {new Date(entry.occurredAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>{" "}
                {entry.line}
              </div>
            ))
          )}
        </div>
        {result?.error && (
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-red-500/5 p-2 text-[10px] text-red-300">
            {JSON.stringify(result.error, null, 2)}
          </pre>
        )}
        {result?.output && (
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-900 p-2 text-[10px] text-zinc-400">
            {typeof result.output === "object"
              ? JSON.stringify(result.output, null, 2)
              : String(result.output)}
          </pre>
        )}
      </div>
    </details>
  );
}

export function GoalAuditContent({
  goalId,
  compact = false,
}: {
  goalId: string;
  compact?: boolean;
}) {
  const [audit, setAudit] = useState<GoalAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const reloadAudit = () => setRefreshKey((value) => value + 1);

  const hasActiveJob = useMemo(
    () => audit?.jobs.some((job) => ACTIVE_JOB_STATUSES.has(job.status)) ?? false,
    [audit],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = () =>
      getGoalAudit(goalId)
        .then((data) => {
          if (!cancelled) setAudit(data);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load job");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    void load();
    const intervalMs = hasActiveJob ? 2000 : 5000;
    const id = window.setInterval(() => void load(), intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [goalId, hasActiveJob, refreshKey]);

  if (loading && !audit) {
    return <p className="text-sm text-zinc-500">Loading job…</p>;
  }

  if (error && !audit) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!audit) return null;

  const resultsByJobId = new Map(audit.results.map((r) => [r.jobId, r]));
  const hasFailed =
    audit.results.some((r) => r.status === "failed") ||
    audit.jobs.some((j) => j.status === "failed");

  return (
    <div className="space-y-4">
      {hasFailed && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          This job finished with errors.
        </div>
      )}

      {!compact && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <h3 className="text-sm font-medium text-zinc-200">{audit.goal.objective}</h3>
          <p className="mt-1 text-xs text-zinc-500">Goal status: {audit.goal.status}</p>
        </section>
      )}

      {audit.tasks.map((task) => {
        const taskJobs = audit.jobs.filter((job) => job.taskId === task.id);

        return (
          <section key={task.id} className="space-y-3">
            {!compact && (
              <div>
                <h4 className="text-sm font-medium text-zinc-200">{task.title}</h4>
                <p className="text-xs text-zinc-500">Scheduler task: {task.status}</p>
              </div>
            )}
            {taskJobs.length === 0 ? (
              <p className="text-xs text-zinc-600">No jobs yet.</p>
            ) : (
              <ul className="space-y-3">
                {taskJobs.map((job) => (
                  <li key={job.id}>
                    <JobRunCard
                      job={job}
                      result={resultsByJobId.get(job.id)}
                      defaultExpanded={ACTIVE_JOB_STATUSES.has(job.status) || job.status === "paused"}
                      workItemId={audit.workItemId}
                      onJobChanged={reloadAudit}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function GoalAuditPanelTitle({ goalId, audit }: { goalId: string; audit?: GoalAudit | null }) {
  if (audit) return audit.goal.objective.slice(0, 80);
  return `Job ${goalId.slice(0, 8)}…`;
}
