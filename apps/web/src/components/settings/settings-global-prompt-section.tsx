"use client";

import { useState } from "react";
import { updateGlobalSystemPrompt } from "@/lib/api";
import { Surface } from "@/components/ui/surface";

export function SettingsGlobalPromptSection({ initialPrompt }: { initialPrompt: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [savedPrompt, setSavedPrompt] = useState(initialPrompt);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const result = await updateGlobalSystemPrompt(prompt);
      setPrompt(result.prompt);
      setSavedPrompt(result.prompt);
      setStatus("Saved. New agent runs will receive this prompt first.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save prompt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-sm font-medium text-secondary">Global system prompt</h2>
      <p className="mb-3 text-xs text-muted">Prepended to every agent prompt. Kampaku can also review and edit it through its dedicated skill.</p>
      <Surface padding="sm">
        <textarea
          aria-label="Global system prompt"
          className="min-h-36 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-accent"
          maxLength={4000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">{prompt.length}/4000</span>
          <button
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={saving || !prompt.trim() || prompt.trim() === savedPrompt}
            onClick={save}
            type="button"
          >
            {saving ? "Saving…" : "Save prompt"}
          </button>
        </div>
        {status && <p className="mt-2 text-xs text-muted" role="status">{status}</p>}
      </Surface>
    </section>
  );
}
