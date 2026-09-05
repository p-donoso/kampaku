"use client";

import { useCallback, useState } from "react";
import { ExecutePauseButton } from "@/components/execute-pause-button";
import { ExecutePlayButton } from "@/components/execute-play-button";
import { notifyRosterSync } from "@/lib/roster-sync";
import type { ProjectRosterEntry, ProjectRosterTaskNode } from "@/lib/types";
import { canPauseProject, canPlayProject, projectExecutionGateLabel } from "@/lib/work-item-utils";

export function ProjectExecutionControls({
  project,
  tasks,
  onRefresh,
}: {
  project: ProjectRosterEntry;
  tasks: ProjectRosterTaskNode[];
  onRefresh?: () => void;
}) {
  const [loading, setLoading] = useState<"play" | "pause" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playEnabled = canPlayProject(project, tasks);
  const pauseEnabled = canPauseProject(project);
  const gateLabel = project.autoExecute && project.executionGated ? projectExecutionGateLabel(project) : null;

  const handlePlay = useCallback(async () => {
    setLoading("play");
    setError(null);
    try {
      const { playProject } = await import("@/lib/api");
      await playProject(project.slug);
      notifyRosterSync({ action: "refresh" });
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start project");
    } finally {
      setLoading(null);
    }
  }, [project.slug, onRefresh]);

  const handlePause = useCallback(async () => {
    setLoading("pause");
    setError(null);
    try {
      const { pauseProject } = await import("@/lib/api");
      await pauseProject(project.slug);
      notifyRosterSync({ action: "refresh" });
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pause project");
    } finally {
      setLoading(null);
    }
  }, [project.slug, onRefresh]);

  if (!playEnabled && !pauseEnabled) return null;

  return (
    <div className="flex items-center gap-1">
      {playEnabled && (
        <ExecutePlayButton
          onClick={handlePlay}
          loading={loading === "play"}
          disabled={loading === "pause"}
          title={
            project.executionGated && project.executionGateReason === "blocked_task"
              ? "Retry blocked task and continue"
              : "Run project from next task"
          }
        />
      )}
      {pauseEnabled && (
        <ExecutePauseButton
          onClick={handlePause}
          loading={loading === "pause"}
          disabled={loading === "play"}
          title="Pause before next task"
        />
      )}
      {gateLabel && (
        <span className="max-w-[140px] truncate text-[10px] text-amber-400" title={gateLabel}>
          {gateLabel}
        </span>
      )}
      {error && (
        <span className="max-w-[120px] truncate text-[10px] text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
