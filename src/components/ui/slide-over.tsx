"use client";

import CloseRounded from "@mui/icons-material/CloseRounded";
import { useEffect, type ReactNode } from "react";

type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: "left" | "right" | "bottom";
  id?: string;
};

export function SlideOver({
  open,
  onClose,
  title,
  children,
  side = "left",
  id,
}: SlideOverProps) {
  useEffect(() => {
    if (!open) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const panelClass =
    side === "bottom"
      ? "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-border"
      : side === "right"
        ? "fixed inset-y-0 right-0 h-full w-[min(85vw,20rem)] border-l border-border"
        : "fixed inset-y-0 left-0 h-full w-[min(85vw,20rem)] border-r border-border";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close panel"
      />
      <aside
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${panelClass} flex flex-col bg-surface shadow-2xl`}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <span className="text-sm font-medium text-foreground">{title}</span>
            <button type="button" onClick={onClose} className="icon-button" aria-label="Close panel">
              <CloseRounded fontSize="small" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
