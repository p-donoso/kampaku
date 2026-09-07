"use client";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/hooks/use-theme";

export function SettingsThemeSection() {
  const { theme } = useTheme();

  return (
    <section className="rounded-xl border border-border bg-surface/30 p-4">
      <h2 className="text-sm font-medium text-foreground">Appearance</h2>
      <p className="mt-1 text-sm text-muted">
        Theme follows your system preference until you choose explicitly. Current:{" "}
        <span className="font-medium text-secondary">{theme}</span>.
      </p>
      <div className="mt-4">
        <ThemeToggle />
      </div>
    </section>
  );
}
