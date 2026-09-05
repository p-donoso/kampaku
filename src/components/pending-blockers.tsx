"use client";

import { useEffect, useState } from "react";
import { listBlockers, resolveBlocker } from "@/lib/api";
import type { AgentBlockage } from "@/lib/types";

export function PendingBlockers({ initialBlockers }: { initialBlockers: AgentBlockage[] }) {
  const [blockers, setBlockers] = useState(initialBlockers);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => listBlockers().then((r) => setBlockers(r.blockers)).catch(() => undefined);
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  async function submit(blocker: AgentBlockage) {
    const resolution = resolutions[blocker.id]?.trim();
    if (!resolution) return;
    setSaving(blocker.id);
    setError(null);
    try {
      await resolveBlocker(blocker.id, resolution);
      setBlockers((items) => items.filter((item) => item.id !== blocker.id));
      setResolutions((current) => ({ ...current, [blocker.id]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save resolution");
    } finally {
      setSaving(null);
    }
  }

  if (!blockers.length) return <p className="text-sm text-zinc-500">No pending blockers.</p>;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
      {blockers.map((item) => {
        const awaitingEmperor = item.recipientAgentSlug === "kampaku";
        return (
          <article key={item.id} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">Blocked</span>
              <span className="text-zinc-500">{item.reportedByAgentSlug} → {item.recipientAgentSlug}</span>
            </div>
            <p className="text-sm text-zinc-100">{item.description}</p>
            {item.context && <p className="mt-1 text-xs text-zinc-500">{item.context}</p>}
            <p className="mt-2 text-[10px] text-zinc-600">Path: {item.escalationPathSlugs.join(" → ")}</p>
            {awaitingEmperor ? (
              <div className="mt-3 flex gap-2">
                <input
                  value={resolutions[item.id] ?? ""}
                  onChange={(e) => setResolutions((current) => ({ ...current, [item.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(item); }}
                  placeholder="Write your instructions…"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-red-500"
                />
                <button type="button" disabled={saving === item.id || !resolutions[item.id]?.trim()} onClick={() => void submit(item)}
                  className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
                  {saving === item.id ? "Saving…" : "Resolve"}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">Awaiting resolution or escalation from the superior.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
