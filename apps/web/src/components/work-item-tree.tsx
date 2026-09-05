"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RuntimeStatusBanner } from "@/components/execution-status";
import { WorkItemTreeTable } from "@/components/work-item-tree-table";
import { useExecutionPolling } from "@/hooks/use-execution-polling";
import type { ProjectOverview, RuntimeStatus, WorkItemTreeNode } from "@/lib/types";

export function WorkItemTree({
  items,
  onExecute,
  onRetry,
  loadingId,
}: {
  items: WorkItemTreeNode[];
  onExecute?: (workItemId: string) => void;
  onRetry?: (workItemId: string) => void;
  loadingId?: string | null;
}) {
  return (
    <WorkItemTreeTable
      items={items}
      onExecute={onExecute}
      onRetry={onRetry}
      loadingId={loadingId}
    />
  );
}

export function WorkItemExecuteProvider({
  items: initialItems,
  projectSlug,
  onRefresh,
  runtime: externalRuntime,
  onRuntimeChange,
  showRuntimeBanner = true,
}: {
  items: WorkItemTreeNode[];
  projectSlug?: string;
  onRefresh?: () => void;
  runtime?: RuntimeStatus | null;
  onRuntimeChange?: (runtime: RuntimeStatus) => void;
  showRuntimeBanner?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(externalRuntime ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    // Refresh local execution state when the server-provided snapshot changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(initialItems);
  }, [initialItems]);

  const handlePollUpdate = useCallback(
    (overview: ProjectOverview, nextRuntime: RuntimeStatus) => {
      setItems(overview.workItems);
      setRuntime(nextRuntime);
      onRuntimeChange?.(nextRuntime);
    },
    [onRuntimeChange],
  );

  useExecutionPolling({
    projectSlug,
    items,
    onUpdate: handlePollUpdate,
    enabled: Boolean(projectSlug),
  });

  async function runWorkItemAction(
    workItemId: string,
    action: "execute" | "retry",
  ) {
    setLoadingId(workItemId);
    setError(null);
    try {
      const api = await import("@/lib/api");
      if (action === "retry") {
        await api.retryWorkItem(workItemId);
      } else {
        await api.executeWorkItem(workItemId);
      }
      const nextRuntime = await api.getRuntimeStatus();
      setRuntime(nextRuntime);
      onRuntimeChange?.(nextRuntime);
      if (onRefresh) {
        onRefresh();
      } else if (projectSlug) {
        const overview = await api.getProjectOverview(projectSlug);
        setItems(overview.workItems);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run task");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div>
      {showRuntimeBanner && <RuntimeStatusBanner runtime={runtime} />}
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <WorkItemTree
        items={items}
        onExecute={(id) => void runWorkItemAction(id, "execute")}
        onRetry={(id) => void runWorkItemAction(id, "retry")}
        loadingId={loadingId}
      />
    </div>
  );
}
