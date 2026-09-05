"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PALETTE_ID, THEME_STORAGE_KEY, type ThemeMode } from "@/design/tokens";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** SSR-safe default — must match the server render; synced from storage on mount. */
const SSR_THEME_DEFAULT: ThemeMode = "dark";

export function readStoredTheme(): ThemeMode | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "dark" || value === "light") return value;
  return null;
}

export function readSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readThemeFromDocument(): ThemeMode | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute("data-theme");
  if (value === "dark" || value === "light") return value;
  return null;
}

export function resolveInitialTheme(): ThemeMode {
  return readStoredTheme() ?? readThemeFromDocument() ?? readSystemTheme();
}

export function applyDocumentTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-palette", PALETTE_ID);
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(SSR_THEME_DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const resolved = resolveInitialTheme();
    setThemeState(resolved);
    applyDocumentTheme(resolved);
    setReady(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (readStoredTheme()) return;
      const next = media.matches ? "dark" : "light";
      setThemeState(next);
      applyDocumentTheme(next);
    };

    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyDocumentTheme(theme);
  }, [theme, ready]);

  const setTheme = useCallback((next: ThemeMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
    applyDocumentTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      applyDocumentTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, ready }),
    [theme, setTheme, toggleTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
