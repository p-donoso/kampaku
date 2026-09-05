"use client";

import { useEffect, useState } from "react";
import { FailedCountBadge } from "@/components/execution-status";
import { useExecutionPolling } from "@/hooks/use-execution-polling";
import { countActiveExecutions, countFailedItems } from "@/lib/work-item-utils";
import type { WorkItemTreeNode } from "@/lib/types";

export function ProjectHeaderStatus({
  projectSlug,
  initialWorkItems,
}: {
  projectSlug: string;
  initialWorkItems: WorkItemTreeNode[];
}) {
  const [workItems, setWorkItems] = useState(initialWorkItems);

  useEffect(() => {
    // Refresh local polling state when the server-provided snapshot changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkItems(initialWorkItems);
  }, [initialWorkItems]);

  useExecutionPolling({
    projectSlug,
    items: workItems,
    onUpdate: (overview) => setWorkItems(overview.workItems),
  });

  const failedCount = countFailedItems(workItems);
  const activeCount = countActiveExecutions(workItems);

  if (failedCount === 0 && activeCount === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <FailedCountBadge count={failedCount} />
      {activeCount > 0 && (
        <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-400">
          {activeCount} activa{activeCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
