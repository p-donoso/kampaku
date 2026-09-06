"use client";

import { useCallback, useEffect, useState } from "react";
import { DetailPanelError, DetailPanelLoading } from "@/components/detail-panel-state";
import { useDetailPanel } from "@/components/detail-panel-context";
import { usePanels } from "@/components/panel-provider";
import {
  WorkItemDetailTabs,
  type WorkItemDraft,
} from "@/components/work-item-detail-tabs";
import { formatUserFacingError, isNotFoundError } from "@/lib/api-errors";
import { deleteWorkItem, getWorkItemDetail, updateWorkItem } from "@/lib/api";
import type { WorkItemDetail } from "@/lib/types";

function toDraft(detail: WorkItemDetail): WorkItemDraft {
  return {
    title: detail.item.title,
    description: detail.item.description ?? "",
    status: detail.item.status,
    priority: detail.item.priority,
    parentId: detail.item.parentId ?? "",
  };
}

export function WorkItemDetailContent({
  id,
  initialTab = "summary",
}: {
  id: string;
  initialTab?: import("@/components/work-item-detail-tabs").WorkItemTab;
}) {
  const { editing, registerHandlers } = useDetailPanel();
  const { close, onEntityNotFound } = usePanels();
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [draft, setDraft] = useState<WorkItemDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return getWorkItemDetail(id).then((data) => {
      setDetail(data);
      setDraft(toDraft(data));
      setError(null);
    });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setDraft(null);

    reload()
      .catch((e) => {
        if (cancelled) return;
        if (isNotFoundError(e)) {
          onEntityNotFound("task", id);
          return;
        }
        setError(formatUserFacingError(e, { entityType: "task", action: "load" }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reload, id, onEntityNotFound]);

  useEffect(() => {
    if (!detail) return;
    const source = new EventSource(`/api/v1/work-items/${encodeURIComponent(id)}/events`);
    const refresh = () => void reload().catch(() => undefined);
    source.addEventListener("work-item", refresh);
    return () => {
      source.removeEventListener("work-item", refresh);
      source.close();
    };
  }, [detail, id, reload]);

  useEffect(() => {
    if (!detail || !draft) return;

    const hasChildren = detail.children.length > 0;
    registerHandlers({
      canDelete: true,
      deleteConfirmMessage: hasChildren
        ? `Delete "${detail.item.title}" and its subtasks? This cannot be undone.`
        : `Delete "${detail.item.title}"? This cannot be undone.`,
      onDelete: async () => {
        await deleteWorkItem(id, hasChildren);
      },
      onSave: async () => {
        if (!draft.title.trim()) return;
        await updateWorkItem(id, {
          title: draft.title.trim(),
          description: draft.description.trim() || undefined,
          status: draft.status,
          priority: draft.priority,
          parent_id: draft.parentId || null,
        });
        const next = await getWorkItemDetail(id);
        setDetail(next);
        setDraft(toDraft(next));
      },
      onCancel: () => {
        setDraft(toDraft(detail));
      },
    });
  }, [detail, draft, registerHandlers, id]);

  if (loading && !detail) {
    return <DetailPanelLoading label="Loading task…" />;
  }

  if (error && !detail) {
    return (
      <DetailPanelError
        title="Could not load task"
        message={error}
        actionLabel="Close"
        onAction={close}
      />
    );
  }

  if (!detail || !draft) return null;

  return (
    <WorkItemDetailTabs
      detail={detail}
      editing={editing}
      draft={draft}
      onDraftChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
      onRefresh={() => void reload()}
      initialTab={initialTab}
    />
  );
}
