"use client";

import { useEffect, useState } from "react";
import { DesignMatrixCell } from "@/components/dev/design-matrix-cell";
import { cellId, PALETTE_LABELS, type PaletteId } from "@/components/dev/logo-mark";
import { ImperialSealLogo, ImperialSealMark } from "@/components/ui/imperial-seal-logo";
import "@/design/palettes.css";

const PALETTES: PaletteId[] = ["B", "I"];

function readSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function DesignMatrixPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setTheme(readSystemTheme());
  }, []);

  return (
    <div
      data-theme={theme}
      className="min-h-dvh overflow-y-auto"
      style={{
        backgroundColor: theme === "dark" ? "#09090b" : "#f4f4f5",
        color: theme === "dark" ? "#fafafa" : "#18181b",
      }}
    >
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Kampaku — Palette Matrix</h1>
            <p className="text-sm text-zinc-500">
              Ume imperial seal. <strong className="text-zinc-400">K-I</strong> Imperial Cinnabar is locked;
              K-B shown for reference.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-zinc-700 p-0.5">
              <ThemeButton active={theme === "dark"} onClick={() => setTheme("dark")}>Dark</ThemeButton>
              <ThemeButton active={theme === "light"} onClick={() => setTheme("light")}>Light</ThemeButton>
            </div>
            {selected && (
              <div className="rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 font-mono text-sm text-zinc-200">
                Selected: {selected}
                {selected === "K-I" && (
                  <span className="ml-2 text-xs font-normal text-zinc-500">(locked palette)</span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <section className="mb-8 grid gap-6 md:grid-cols-2">
          {PALETTES.map((palette) => (
            <div
              key={palette}
              className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6"
              data-palette={palette === "B" ? "command-tent" : "imperial-cinnabar"}
              data-theme={theme}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {PALETTE_LABELS[palette]} — stamped
              </p>
              <ImperialSealLogo stamped />
              <div className="flex items-end gap-4">
                <ImperialSealMark size="lg" />
                <ImperialSealMark size="md" />
                <ImperialSealMark size="sm" />
              </div>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {PALETTES.map((palette) => {
            const id = cellId(palette);
            return (
              <DesignMatrixCell
                key={id}
                palette={palette}
                theme={theme}
                selected={selected === id}
                onSelect={() => setSelected(id)}
              />
            );
          })}
        </div>

        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
          <p>
            Static exports: <code className="text-zinc-300">docs/branding/previews/matrix-preview-dark.png</code>
          </p>
          <p className="mt-2">
            Locked palette: <code className="text-zinc-300">K-I</code> Imperial Cinnabar — see{" "}
            <code className="text-zinc-300">docs/branding/foundations.md</code>.
          </p>
        </section>
      </main>
    </div>
  );
}

function ThemeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}
