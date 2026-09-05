"use client";

import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import { useTheme } from "@/hooks/use-theme";

type ThemeToggleProps = {
  compact?: boolean;
  className?: string;
};

export function ThemeToggle({ compact = false, className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle"
      className={`icon-button ${compact ? "min-h-10 min-w-10" : "min-h-11 min-w-11"} ${className}`}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? <LightModeRounded fontSize="small" /> : <DarkModeRounded fontSize="small" />}
      {!compact && (
        <span className="text-sm">{isDark ? "Light" : "Dark"}</span>
      )}
    </button>
  );
}
