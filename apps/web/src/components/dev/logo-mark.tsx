"use client";

import type { ReactNode } from "react";

export type PaletteId = "B" | "I";

export const PALETTE_IDS: Record<PaletteId, string> = {
  B: "command-tent",
  I: "imperial-cinnabar",
};

export const PALETTE_LABELS: Record<PaletteId, string> = {
  B: "Command Tent",
  I: "Imperial Cinnabar",
};

export const CELL_NOTES: Record<string, string> = {
  "K-B": "Bronze stone + warm ume — grounded 関幕 patina, personal command post.",
  "K-I": "Black / vermillion / gold — shuniku seal ink, imperial frame ticks, crest on charcoal.",
};

export function cellId(palette: PaletteId): string {
  return `K-${palette}`;
}

export function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{ color, borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </span>
  );
}
