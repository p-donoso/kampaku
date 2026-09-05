/** Locked palette for production UI — K-I Imperial Cinnabar. */
export const PALETTE_ID = "imperial-cinnabar" as const;

export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "kampaku-theme";

/** Semantic CSS custom property names (match palettes/imperial-cinnabar.css). */
export const CSS_VARS = {
  bgBase: "--bg-base",
  bgSurface: "--bg-surface",
  bgElevated: "--bg-elevated",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textMuted: "--text-muted",
  borderDefault: "--border-default",
  brand: "--brand",
  brandSubtle: "--brand-subtle",
  brandGold: "--brand-gold",
  brandDeep: "--brand-deep",
  success: "--success",
  warning: "--warning",
  error: "--error",
  info: "--info",
  agent: "--agent",
} as const;

/** Read a token from the document root (client-only). */
export function readCssVar(name: string, fallback = ""): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
