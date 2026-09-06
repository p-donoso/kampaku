"use client";

import { useEffect, useMemo, useState } from "react";
import { ExecutePlayButton } from "@/components/execute-play-button";
import { WorkItemStatusBadge } from "@/components/execution-status";
import { usePanels } from "@/components/panel-provider";
import { formatComplexityShort } from "@/lib/complexity-format";
import type { WorkItemTreeNode } from "@/lib/types";
import {
  canExecuteWorkItemInTree,
  canRetryWorkItemInTree,
  collectExpandableWorkItemIds,
  countDoneLeaves,
  flattenVisibleWorkItemRows,
  workItemRowBorderClass,
} from "@/lib/work-item-utils";

function SubtaskProgress({ node }: { node: WorkItemTreeNode }) {
  const { done, total } = countDoneLeaves(node.children);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-1 min-w-[88px]">
      <div className="mb-1 flex justify-between text-[10px] text-zinc-600">
        <span>
          {done}/{total} leaves
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function WorkItemTreeTable({
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
  const { openTask, openAgent } = usePanels();
  const [expandedKeys, setExpandedKeys] = useState(
    () => new Set(collectExpandableWorkItemIds(items)),
  );

  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      for (const id of collectExpandableWorkItemIds(items)) {
        next.add(id);
      }
      return next;
    });
  }, [items]);

  const rows = useMemo(
    () => flattenVisibleWorkItemRows(items, expandedKeys),
    [items, expandedKeys],
  );

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
        No tasks yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/60">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              Task
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              Status
            </th>
            <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 lg:table-cell">
              Complexity
            </th>
            <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 sm:table-cell">
              Progress
            </th>
            <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 md:table-cell">
              Assignee
            </th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, node, depth, hasChildren, expanded }) => {
            const { item, children } = node;
            const isContainer = children.length > 0;
            const isExecuting = item.executionPhase === "queued" || item.executionPhase === "running";
            const canExecute = onExecute && canExecuteWorkItemInTree(node, items);
            const canRetry = onRetry && canRetryWorkItemInTree(node);
            const isLoading = loadingId === item.id;

            return (
              <tr
                key={key}
                className={`border-b border-zinc-800/80 border-l-2 ${workItemRowBorderClass(node)} ${
                  isContainer ? "bg-zinc-900/40" : "hover:bg-zinc-900/30"
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-start gap-2" style={{ paddingLeft: depth * 20 }}>
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(key)}
                        aria-expanded={expanded}
                        aria-label={expanded ? "Collapse" : "Expand"}
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        <span className="text-[10px]">{expanded ? "▼" : "▶"}</span>
                      </button>
                    ) : (
                      <span className="h-5 w-5 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => openTask(item.id)}
                      className="min-w-0 text-left hover:text-amber-400"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={isContainer ? "font-medium text-zinc-100" : "text-zinc-300"}>
                          {item.title}
                        </span>
                        {isContainer && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                            {children.length} subtask{children.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-600">{item.description}</p>
                      )}
                    </button>
                  </div>
                </td>

                <td className="px-3 py-3">
                  <WorkItemStatusBadge item={item} />
                </td>

                <td className="hidden px-3 py-3 lg:table-cell">
                  {item.complexity ? (
                    <span className="font-mono text-[10px] text-zinc-400">
                      {formatComplexityShort(item.complexity)}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </td>

                <td className="hidden px-3 py-3 sm:table-cell">
                  {isContainer ? (
                    <SubtaskProgress node={node} />
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </td>

                <td className="hidden px-3 py-3 md:table-cell">
                  {item.assigneeSlug ? (
                    <button
                      type="button"
                      onClick={() => openAgent(item.assigneeSlug!)}
                      className="font-mono text-[10px] text-violet-400 hover:text-violet-300"
                    >
                      {item.assigneeSlug}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </td>

                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {canExecute && (
                      <ExecutePlayButton
                        onClick={() => onExecute!(item.id)}
                        loading={isLoading}
                        title={`Execute: ${item.title}`}
                      />
                    )}
                    {canRetry && (
                      <ExecutePlayButton
                        onClick={() => onRetry!(item.id)}
                        loading={isLoading}
                        title={`Retry: ${item.title}`}
                      />
                    )}
                    {(isExecuting || isLoading) && !canExecute && !canRetry && (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                        <span className="h-2.5 w-2.5 animate-spin rounded-full border border-blue-400 border-t-transparent" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => openTask(item.id)}
                      className="text-xs text-amber-500 hover:text-amber-400"
                    >
                      Open →
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
