"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RuntimeStatusBanner, FailedCountBadge } from "@/components/execution-status";
import { usePanels } from "@/components/panel-provider";
import { WorkItemExecuteProvider } from "@/components/work-item-tree";
import { useExecutionPolling } from "@/hooks/use-execution-polling";
import {
  countActiveExecutions,
  countFailedItems,
  flattenWorkItems,
} from "@/lib/work-item-utils";
import type { ProjectOverview, RuntimeStatus, WorkItemRecord, WorkItemTreeNode } from "@/lib/types";

const STATUS_OPTIONS = ["backlog", "todo", "in_progress", "blocked", "done", "cancelled"] as const;

function TaskCrudPanel({
  projectId,
  projectSlug,
  workItems,
  onRefresh,
}: {
  projectId: string;
  projectSlug: string;
  workItems: WorkItemTreeNode[];
  onRefresh: () => void;
}) {
  const flat = useMemo(() => flattenWorkItems(workItems), [workItems]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<string>("todo");
  const [formPriority, setFormPriority] = useState(0);
  const [formParentId, setFormParentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setEditingId(null);
    setCreatingParentId(undefined);
    setFormTitle("");
    setFormDescription("");
    setFormStatus("todo");
    setFormPriority(0);
    setFormParentId("");
    setError(null);
  }

  function startCreate(parentId?: string | null) {
    resetForm();
    setCreatingParentId(parentId ?? null);
    setFormParentId(parentId ?? "");
  }

  function startEdit(item: WorkItemRecord) {
    setCreatingParentId(undefined);
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormDescription(item.description ?? "");
    setFormStatus(item.status);
    setFormPriority(item.priority);
    setFormParentId(item.parentId ?? "");
  }

  async function saveCreate() {
    if (!formTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { createWorkItem } = await import("@/lib/api");
      await createWorkItem(projectId, {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        parent_id: creatingParentId ?? (formParentId || undefined),
        status: formStatus,
        priority: formPriority,
      });
      resetForm();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando tarea");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId || !formTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { updateWorkItem } = await import("@/lib/api");
      await updateWorkItem(editingId, {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        status: formStatus,
        priority: formPriority,
        parent_id: formParentId || null,
      });
      resetForm();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error actualizando tarea");
    } finally {
      setBusy(false);
    }
  }

  async function reorder(item: WorkItemRecord, direction: "up" | "down") {
    const siblings = flat
      .filter((wi) => (wi.parentId ?? null) === (item.parentId ?? null))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const idx = siblings.findIndex((s) => s.id === item.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;

    setBusy(true);
    try {
      const { updateWorkItem } = await import("@/lib/api");
      const other = siblings[swapIdx];
      await updateWorkItem(item.id, { sort_order: other.sortOrder ?? swapIdx });
      await updateWorkItem(other.id, { sort_order: item.sortOrder ?? idx });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error reordenando");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: WorkItemRecord, cascade: boolean) {
    const hasChildren = flat.some((wi) => wi.parentId === item.id);
    if (hasChildren && !cascade) {
      if (!confirm(`"${item.title}" tiene subtareas. ¿Eliminar con todas las subtareas?`)) return;
      cascade = true;
    } else if (!confirm(`¿Eliminar "${item.title}"?`)) {
      return;
    }

    setBusy(true);
    try {
      const { deleteWorkItem } = await import("@/lib/api");
      await deleteWorkItem(item.id, cascade);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    } finally {
      setBusy(false);
    }
  }

  function CrudForm({ onSave, label }: { onSave: () => void; label: string }) {
    return (
      <div className="my-2 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3 space-y-2">
        <input
          type="text"
          value={formTitle}
          onChange={(e) => setFormTitle(e.target.value)}
          placeholder="Título"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
        />
        <textarea
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          rows={2}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="number"
            value={formPriority}
            onChange={(e) => setFormPriority(Number(e.target.value))}
            className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
            title="Prioridad"
          />
          {editingId && (
            <select
              value={formParentId}
              onChange={(e) => setFormParentId(e.target.value)}
              className="min-w-[8rem] flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
            >
              <option value="">Sin padre (raíz)</option>
              {flat
                .filter((wi) => wi.id !== editingId)
                .map((wi) => (
                  <option key={wi.id} value={wi.id}>{wi.title}</option>
                ))}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="rounded bg-amber-600/80 px-2 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {label}
          </button>
          <button type="button" onClick={resetForm} className="text-xs text-zinc-500 hover:text-zinc-300">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  const { openTask } = usePanels();

  function TaskRow({ node, depth }: { node: WorkItemTreeNode; depth: number }) {
    const { item, children } = node;
    const isContainer = children.length > 0;
    const isEditing = editingId === item.id;
    const isCreatingHere = creatingParentId === item.id;

    return (
      <div style={{ marginLeft: depth * 16 }}>
        <div className="group flex flex-wrap items-center gap-1 py-1">
          <button
            type="button"
            onClick={() => openTask(item.id)}
            className={`text-xs text-left hover:text-amber-400 ${isContainer ? "font-semibold text-zinc-200" : "text-zinc-400"}`}
          >
            {isContainer ? "◆" : "·"} {item.title}
          </button>
          <span className="text-[10px] text-zinc-600">{item.status}</span>
          <div className="ml-auto flex gap-0.5 opacity-60 group-hover:opacity-100">
            <button type="button" onClick={() => startCreate(item.id)} className="rounded px-1 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Subtarea">+</button>
            <button type="button" onClick={() => startEdit(item)} className="rounded px-1 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Editar">✎</button>
            <button type="button" onClick={() => reorder(item, "up")} className="rounded px-1 text-[10px] text-zinc-500 hover:bg-zinc-800" title="Subir">↑</button>
            <button type="button" onClick={() => reorder(item, "down")} className="rounded px-1 text-[10px] text-zinc-500 hover:bg-zinc-800" title="Bajar">↓</button>
            <button type="button" onClick={() => remove(item, false)} className="rounded px-1 text-[10px] text-red-500/70 hover:bg-red-500/10" title="Eliminar">×</button>
          </div>
        </div>
        {isEditing && <CrudForm onSave={saveEdit} label="Guardar" />}
        {isCreatingHere && <CrudForm onSave={saveCreate} label="Crear subtarea" />}
        {children.map((child) => (
          <TaskRow key={child.item.id} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">Gestión de tareas</span>
        <button
          type="button"
          onClick={() => startCreate(null)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          + Tarea raíz
        </button>
      </div>
      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400">{error}</div>
      )}
      {creatingParentId === null && creatingParentId !== undefined && (
        <CrudForm onSave={saveCreate} label="Crear tarea" />
      )}
      {workItems.map((node) => (
        <TaskRow key={node.item.id} node={node} depth={0} />
      ))}
    </div>
  );
}

export function ProjectTasks({
  projectSlug,
  projectId,
  workItems: initialWorkItems,
}: {
  projectSlug: string;
  projectId: string;
  workItems: ProjectOverview["workItems"];
}) {
  const router = useRouter();
  const [workItems, setWorkItems] = useState(initialWorkItems);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [showCrud, setShowCrud] = useState(false);

  useEffect(() => {
    setWorkItems(initialWorkItems);
  }, [initialWorkItems]);

  useEffect(() => {
    import("@/lib/api").then(({ getRuntimeStatus }) => {
      getRuntimeStatus().then(setRuntime).catch(() => undefined);
    });
  }, []);

  const refresh = useCallback(async () => {
    const { getProjectOverview } = await import("@/lib/api");
    const overview = await getProjectOverview(projectSlug);
    setWorkItems(overview.workItems);
    router.refresh();
  }, [projectSlug, router]);

  useExecutionPolling({
    projectSlug,
    items: workItems,
    onUpdate: (overview, nextRuntime) => {
      setWorkItems(overview.workItems);
      setRuntime(nextRuntime);
    },
  });

  const failedCount = countFailedItems(workItems);
  const activeCount = countActiveExecutions(workItems);

  if (workItems.length === 0 && !showCrud) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-500">Sin tareas.</p>
        <button
          type="button"
          onClick={() => setShowCrud(true)}
          className="text-xs text-amber-500 hover:text-amber-400"
        >
          + Crear primera tarea
        </button>
        {showCrud && (
          <TaskCrudPanel
            projectId={projectId}
            projectSlug={projectSlug}
            workItems={workItems}
            onRefresh={refresh}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <RuntimeStatusBanner runtime={runtime} />
        {activeCount > 0 && (
          <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400">
            {activeCount} activa{activeCount !== 1 ? "s" : ""}
          </span>
        )}
        <FailedCountBadge count={failedCount} compact />
        <button
          type="button"
          onClick={() => setShowCrud(!showCrud)}
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
        >
          {showCrud ? "Ocultar edición" : "Editar tareas"}
        </button>
      </div>

      {showCrud ? (
        <TaskCrudPanel
          projectId={projectId}
          projectSlug={projectSlug}
          workItems={workItems}
          onRefresh={refresh}
        />
      ) : (
        <WorkItemExecuteProvider
          items={workItems}
          projectSlug={projectSlug}
          onRefresh={refresh}
          runtime={runtime}
          onRuntimeChange={setRuntime}
          showRuntimeBanner={false}
        />
      )}
    </div>
  );
}
