"use client";

import CheckRounded from "@mui/icons-material/CheckRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import CircularProgress from "@mui/material/CircularProgress";
import { useRouter } from "next/navigation";
import { useDetailPanel } from "@/components/panels/detail-panel-context";
import { usePanels } from "@/components/panels/panel-provider";
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

  /**
   * The generic sentence for the entities whose deletion is not gated by the Core.
   *
   * An agent and a project are gated, and for those the operator is asked with the **server's own
   * consequence** instead of this text (BOARD F-043): the wording approved is the wording recorded.
   */
  const localMessage = () =>
    handlers.deleteConfirmMessage ??
    (entityType === "agent"
      ? `Delete agent "${slug}"? This cannot be undone.`
      : entityType === "skill"
        ? `Delete skill "${slug}"? This cannot be undone.`
        : entityType === "task"
          ? "Delete this task? This cannot be undone."
          : `Delete project "${slug}"? This cannot be undone.`);

  const handleDelete = async () => {
    ctx.setBusy("delete");
    try {
      if (handlers.onDelete) {
        // The panel's own handler owns its confirmation; it is a different operation with a different gate.
        if (!window.confirm(localMessage())) return;
        await handlers.onDelete();
      } else if (entityType === "agent") {
        // Two steps inside the client, and the ask happens **between** them, with the consequence the server
        // recorded for this exact target.
        await deleteAgent(slug, (consequence) => window.confirm(consequence));
      } else if (entityType === "skill") {
        if (!window.confirm(localMessage())) return;
        await deleteSkill(slug);
      } else if (entityType === "task") {
        if (!window.confirm(localMessage())) return;
        await deleteWorkItem(slug);
      } else {
        await deleteProject(slug, (consequence) => window.confirm(consequence));
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
          aria-label="Save changes"
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
          aria-label="Cancel editing"
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
        aria-label="Edit"
      >
        <EditRounded fontSize="small" />
      </button>
      {handlers.canDelete !== false && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy !== null}
          className="sidebar-control text-red-400 hover:text-red-300 disabled:opacity-40"
          aria-label="Delete"
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
