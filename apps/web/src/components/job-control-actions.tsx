"use client";

import { useState } from "react";
import { cancelJobRun, pauseJobRun, resumeJobRun, retryWorkItem } from "@/lib/api";

function ControlButton({
  label,
  onClick,
  disabled,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger" | "primary";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/30 text-red-300 hover:border-red-400/50 hover:text-red-200"
      : tone === "primary"
        ? "border-blue-500/30 text-blue-300 hover:border-blue-400/50 hover:text-blue-200"
        : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={`rounded border px-2 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {label}
    </button>
  );
}

export function JobControlActions({
  jobId,
  jobStatus,
  workItemId,
  onChanged,
}: {
  jobId: string;
  jobStatus: string;
  workItemId?: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const isActive = jobStatus === "queued" || jobStatus === "leased" || jobStatus === "running";
  const isPaused = jobStatus === "paused";
  const canRetry = Boolean(workItemId) && (jobStatus === "failed" || jobStatus === "cancelled");

  if (!isActive && !isPaused && !canRetry) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {isActive && (
        <>
          <ControlButton
            label={busy === "pause" ? "Pausing…" : "Pause"}
            disabled={busy !== null}
            onClick={() => void run("pause", () => pauseJobRun(jobId))}
          />
          <ControlButton
            label={busy === "cancel" ? "Cancelling…" : "Cancel"}
            disabled={busy !== null}
            tone="danger"
            onClick={() => void run("cancel", () => cancelJobRun(jobId))}
          />
        </>
      )}
      {isPaused && (
        <>
          <ControlButton
            label={busy === "resume" ? "Resuming…" : "Resume"}
            disabled={busy !== null}
            tone="primary"
            onClick={() => void run("resume", () => resumeJobRun(jobId))}
          />
          <ControlButton
            label={busy === "cancel" ? "Cancelling…" : "Cancel"}
            disabled={busy !== null}
            tone="danger"
            onClick={() => void run("cancel", () => cancelJobRun(jobId))}
          />
        </>
      )}
      {canRetry && workItemId && (
        <ControlButton
          label={busy === "retry" ? "Retrying…" : "Retry task"}
          disabled={busy !== null}
          tone="primary"
          onClick={() => void run("retry", () => retryWorkItem(workItemId))}
        />
      )}
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}
