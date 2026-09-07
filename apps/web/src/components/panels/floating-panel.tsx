"use client";

import CloseRounded from "@mui/icons-material/CloseRounded";
import Typography from "@mui/material/Typography";
import { useEffect } from "react";

export function FloatingPanel({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  blocked = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  blocked?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open || blocked) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose, blocked]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center md:items-center md:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm max-md:hidden"
        onClick={onClose}
        aria-label="Close panel"
        disabled={blocked}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="floating-panel-title"
        aria-busy={blocked}
        className="relative flex h-dvh w-full flex-col overflow-hidden border-border bg-background shadow-2xl md:h-[95vh] md:max-h-[95dvh] md:w-[96vw] md:rounded-2xl md:border lg:h-[92vh] lg:w-[94vw] lg:max-w-7xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div className="min-w-0">
            <Typography id="floating-panel-title" variant="h6" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" className="block truncate">
                {subtitle}
              </Typography>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              disabled={blocked}
              className="sidebar-control shrink-0 disabled:opacity-40"
              aria-label="Close panel"
            >
              <CloseRounded fontSize="small" />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </section>
    </div>
  );
}
