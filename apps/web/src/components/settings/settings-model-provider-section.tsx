"use client";

import { useState } from "react";
import { updateModelProviderSettings } from "@/lib/api";
import type { ModelProviderSettings } from "@/lib/types";
import { Surface } from "@/components/ui/surface";

export function SettingsModelProviderSection({ initialSettings }: { initialSettings: ModelProviderSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setSaving(true); setStatus(null);
    try {
      const result = await updateModelProviderSettings({ ...settings, apiKey: apiKey || undefined, clearApiKey });
      setSettings(result); setApiKey(""); setClearApiKey(false);
      setStatus("Saved. New model requests and jobs will use this configuration.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save model provider");
    } finally { setSaving(false); }
  }

  return <section>
    <h2 className="mb-1 text-sm font-medium text-secondary">Bring your own token</h2>
    <p className="mb-3 text-xs leading-5 text-muted">Use any provider that implements OpenAI-compatible Chat Completions at a v1 endpoint, including a local Free LLM API instance.</p>
    <Surface>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Provider name" value={settings.provider} onChange={(provider) => setSettings({ ...settings, provider })} placeholder="Free LLM API" />
        <label className="block text-xs text-muted">Protocol
          <input className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-muted" disabled value="OpenAI API v1" />
        </label>
        <label className="block text-xs text-muted sm:col-span-2">Base URL
          <input aria-label="Base URL" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-accent" onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} placeholder="http://localhost:3001/v1" type="url" value={settings.baseUrl} />
          <span className="mt-1 block text-[11px]">Must include the <code>/v1</code> suffix.</span>
        </label>
        <Field label="Model" value={settings.model} onChange={(model) => setSettings({ ...settings, model })} placeholder="auto or provider/model-name" mono />
        <label className="block text-xs text-muted">API key
          <input aria-label="API key" autoComplete="off" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-accent" disabled={clearApiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={settings.apiKeyConfigured ? "Stored — enter to replace" : "Enter token"} type="password" value={apiKey} />
        </label>
      </div>
      {settings.apiKeyConfigured && <label className="mt-4 flex items-center gap-2 text-xs text-muted"><input checked={clearApiKey} onChange={(e) => { setClearApiKey(e.target.checked); setApiKey(""); }} type="checkbox" /> Remove the stored API key</label>}
      <div className="mt-5 flex justify-end"><button className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !settings.provider.trim() || !settings.baseUrl.trim() || !settings.model.trim()} onClick={save} type="button">{saving ? "Saving…" : "Save provider"}</button></div>
      {status && <p className="mt-3 text-xs text-muted" role="status">{status}</p>}
    </Surface>
  </section>;
}

function Field({ label, value, onChange, placeholder, mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; mono?: boolean }) {
  return <label className="block text-xs text-muted">{label}<input aria-label={label} className={`mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent ${mono ? "font-mono" : ""}`} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} value={value} /></label>;
}
