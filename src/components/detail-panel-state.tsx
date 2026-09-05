"use client";

import CircularProgress from "@mui/material/CircularProgress";

export function DetailPanelLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16">
      <CircularProgress size={28} sx={{ color: "var(--brand)" }} />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function DetailPanelError({
  title,
  message,
  actionLabel = "Close",
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="rounded-full bg-red-500/10 p-3 text-red-400">
        <span className="text-lg leading-none">!</span>
      </div>
      <div className="max-w-md space-y-2">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted">{message}</p>
      </div>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg border border-border px-4 py-2 text-sm text-secondary hover:bg-elevated/40 hover:text-foreground"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
