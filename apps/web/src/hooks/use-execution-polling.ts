"use client";

import { useEffect, useRef } from "react";
import { flattenWorkItems } from "@/lib/work-item-utils";
import type { ProjectOverview, RuntimeStatus, WorkItemTreeNode } from "@/lib/types";

function hasActiveExecutions(items: WorkItemTreeNode[]): boolean {
  return flattenWorkItems(items).some(
    (item) =>
      item.executionPhase === "queued" ||
      item.executionPhase === "running" ||
      item.status === "in_progress",
  );
}

export function useExecutionPolling({
  projectSlug,
  items,
  onUpdate,
  enabled = true,
  intervalMs = 3000,
}: {
  projectSlug?: string;
  items: WorkItemTreeNode[];
  onUpdate: (overview: ProjectOverview, runtime: RuntimeStatus) => void;
  enabled?: boolean;
  intervalMs?: number;
}) {
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled || !projectSlug || !hasActiveExecutions(items)) return;

    let cancelled = false;

    async function poll() {
      try {
        const { getProjectOverview, getRuntimeStatus } = await import("@/lib/api");
        const [overview, runtime] = await Promise.all([
          getProjectOverview(projectSlug!),
          getRuntimeStatus(),
        ]);
        if (!cancelled) onUpdateRef.current(overview, runtime);
      } catch {
        /* ignore transient errors */
      }
    }

    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, projectSlug, items, intervalMs]);
}
