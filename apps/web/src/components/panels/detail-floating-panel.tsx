"use client";

import CircularProgress from "@mui/material/CircularProgress";
import { FloatingPanel } from "@/components/panels/floating-panel";
import { DetailPanelHeaderActions } from "@/components/panels/detail-panel-header-actions";
import { useOptionalDetailPanel } from "@/components/panels/detail-panel-context";

const BUSY_LABELS = {
  save: "Guardando cambios…",
  delete: "Eliminando…",
} as const;

export function DetailFloatingPanel({
  open,
  onClose,
  title,
  subtitle,
  showDetailActions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  showDetailActions: boolean;
  children: React.ReactNode;
}) {
  const detailPanel = useOptionalDetailPanel();
  const busy = detailPanel?.busy ?? null;

  const handleClose = () => {
    if (busy) return;
    if (detailPanel?.editing) {
      detailPanel.getHandlers().onCancel?.();
      detailPanel.setEditing(false);
      return;
    }
    onClose();
  };

  return (
    <FloatingPanel
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      headerActions={showDetailActions ? <DetailPanelHeaderActions /> : undefined}
      blocked={busy !== null}
    >
      {children}
      {busy && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950/75 backdrop-blur-[1px]"
          aria-live="polite"
          aria-busy="true"
        >
          <CircularProgress size={32} sx={{ color: "#f59e0b" }} />
          <p className="text-sm text-zinc-400">{BUSY_LABELS[busy]}</p>
        </div>
      )}
    </FloatingPanel>
  );
}
