"use client";

/** Kanji for 関幕 (kanmaku / command tent) — the namesake mark. Romaji always appears below in product UI. */
export const KANJI_MARK = "関幕";

type BrandLogoProps = {
  /** Icon-only: kanji only (collapsed sidebar). */
  compact?: boolean;
  /** Sidebar header: kanji + romaji, no subtitle. */
  header?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, header = false, className = "" }: BrandLogoProps) {
  if (compact) {
    return (
      <span
        className={`kanji-mark text-xl font-medium leading-none text-[var(--brand)] ${className}`}
        aria-label="Kampaku"
        title="Kampaku"
      >
        {KANJI_MARK}
      </span>
    );
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="kanji-mark text-[1.35rem] font-medium leading-none tracking-wide text-[var(--brand)]">
        {KANJI_MARK}
      </div>
      <div className="mt-1 font-semibold leading-tight text-[var(--brand)]">Kampaku</div>
      {!header && (
        <div className="mt-0.5 text-xs leading-tight text-[var(--text-muted)]">Control Plane</div>
      )}
    </div>
  );
}
