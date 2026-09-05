"use client";

import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import CircularProgress from "@mui/material/CircularProgress";
import { useRouter } from "next/navigation";
import { useDetailPanel } from "@/components/detail-panel-context";
import { usePanels } from "@/components/panel-provider";
import { formatUserFacingError } from "@/lib/api-errors";
import { deleteAgent, deleteProject, deleteSkill, deleteWorkItem } from "@/lib/api";
import { notifyRosterSync } from "@/lib/roster-sync";

export function DetailPanelHeaderActions() {
  const ctx = useDetailPanel();
  const { close, markEntityDeleted } = usePanels();
  const router = useRouter();

  if (!ctx.entityType || !ctx.slug) return null;

  const entityType = ctx.entityType;
  const slug = ctx.slug;
  const handlers = ctx.getHandlers();
  const busy = ctx.busy;

  const handleDelete = async () => {
    const message =
      handlers.deleteConfirmMessage ??
      (entityType === "agent"
        ? `¿Eliminar el agente "${slug}"? Esta acción no se puede deshacer.`
        : entityType === "skill"
          ? `¿Eliminar la skill "${slug}"? Esta acción no se puede deshacer.`
          : entityType === "task"
            ? "¿Eliminar esta tarea? Esta acción no se puede deshacer."
            : `¿Eliminar el proyecto "${slug}"? Esta acción no se puede deshacer.`);
    if (!window.confirm(message)) return;

    ctx.setBusy("delete");
    try {
      if (handlers.onDelete) {
        await handlers.onDelete();
      } else if (entityType === "agent") {
        await deleteAgent(slug);
      } else if (entityType === "skill") {
        await deleteSkill(slug);
      } else if (entityType === "task") {
        await deleteWorkItem(slug);
      } else {
        await deleteProject(slug);
      }
      markEntityDeleted(entityType, slug);
      close();
      router.refresh();
    } catch (error) {
      window.alert(
        formatUserFacingError(error, { entityType, action: "delete" }),
      );
    } finally {
      ctx.setBusy(null);
    }
  };

  const handleSave = async () => {
    if (!handlers.onSave) return;
    ctx.setBusy("save");
    try {
      await handlers.onSave();
      ctx.setEditing(false);
      notifyRosterSync({ action: "refresh" });
      router.refresh();
    } catch (error) {
      window.alert(formatUserFacingError(error, { entityType, action: "save" }));
    } finally {
      ctx.setBusy(null);
    }
  };

  const handleCancel = () => {
    if (busy) return;
    handlers.onCancel?.();
    ctx.setEditing(false);
  };

  if (ctx.editing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy !== null}
          className="sidebar-control text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
          aria-label="Guardar cambios"
        >
          {busy === "save" ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <CheckRounded fontSize="small" />
          )}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy !== null}
          className="sidebar-control disabled:opacity-40"
          aria-label="Cancelar edición"
        >
          <CloseRounded fontSize="small" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => ctx.setEditing(true)}
        disabled={busy !== null}
        className="sidebar-control disabled:opacity-40"
        aria-label="Editar"
      >
        <EditRounded fontSize="small" />
      </button>
      {handlers.canDelete !== false && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy !== null}
          className="sidebar-control text-red-400 hover:text-red-300 disabled:opacity-40"
          aria-label="Eliminar"
        >
          {busy === "delete" ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <DeleteOutlineRounded fontSize="small" />
          )}
        </button>
      )}
    </div>
  );
}
