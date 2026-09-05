"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetAllData, resetBootstrap } from "@/lib/api";

type Action = "bootstrap" | "all";

export function SettingsDangerZone() {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [keepLearnings, setKeepLearnings] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const requiredConfirmation = action === "all" ? "RESET ALL" : "RESET BOOTSTRAP";

  async function runReset() {
    if (!action || confirmation !== requiredConfirmation) return;
    setRunning(true);
    setStatus(null);
    try {
      const result = action === "all" ? await resetAllData() : await resetBootstrap(keepLearnings);
      const learningMessage = result.inheritedLearnings > 0
        ? ` ${result.inheritedLearnings} learnings were inherited.`
        : "";
      setStatus(`Reset complete. ${result.createdAgents.length} bootstrap agents were recreated.${learningMessage}`);
      setAction(null);
      setConfirmation("");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="border-t border-error/30 pt-6">
      <h2 className="mb-1 text-sm font-medium text-error">Danger zone</h2>
      <p className="mb-3 text-xs text-muted">Destructive maintenance actions. Both operations reapply the current project bootstrap.</p>

      <div className="divide-y divide-error/20 overflow-hidden rounded-xl border border-error/35 bg-error/[0.03]">
        <DangerAction
          title="Reset bootstrap agents"
          description="Deletes only agents managed by the bootstrap, then recreates them from the current definitions. Manually created agents and project data remain intact."
          button="Reset bootstrap"
          onClick={() => { setAction("bootstrap"); setConfirmation(""); setStatus(null); }}
        />
        <DangerAction
          title="Reset everything"
          description="Permanently deletes all projects, work, conversations, memories, agents, skills, and settings, then applies a clean bootstrap."
          button="Reset everything"
          onClick={() => { setAction("all"); setConfirmation(""); setStatus(null); }}
        />
      </div>

      {status && <p className="mt-3 text-xs text-muted" role="status">{status}</p>}

      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="presentation">
          <div aria-labelledby="reset-dialog-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-error/40 bg-background p-5 shadow-2xl" role="dialog">
            <h3 className="text-base font-semibold text-foreground" id="reset-dialog-title">
              {action === "all" ? "Reset everything?" : "Reset bootstrap agents?"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {action === "all"
                ? "This cannot be undone. Every stored record will be deleted before bootstrap runs again."
                : "Bootstrap-managed agents will be deleted from the leaves upward and recreated from their current definitions."}
            </p>

            {action === "bootstrap" && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                <input checked={keepLearnings} className="mt-0.5 size-4 accent-violet-500" onChange={(event) => setKeepLearnings(event.target.checked)} type="checkbox" />
                <span>
                  <span className="block text-sm font-medium text-foreground">Keep learnings</span>
                  <span className="mt-0.5 block text-xs text-muted">A recreated agent with the same slug inherits the previous agent&apos;s learnings. Logs are not carried over.</span>
                </span>
              </label>
            )}

            <label className="mt-4 block text-xs text-muted">
              Type <span className="font-mono font-semibold text-foreground">{requiredConfirmation}</span> to continue
              <input
                autoFocus
                className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-error"
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-border px-3 py-2 text-sm text-secondary hover:bg-surface" disabled={running} onClick={() => setAction(null)} type="button">Cancel</button>
              <button className="rounded-lg bg-error px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={running || confirmation !== requiredConfirmation} onClick={runReset} type="button">
                {running ? "Resetting…" : "Confirm reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DangerAction({ title, description, button, onClick }: { title: string; description: string; button: string; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="pr-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <button className="shrink-0 self-start rounded-lg border border-error/60 px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error hover:text-white sm:self-auto" onClick={onClick} type="button">{button}</button>
    </div>
  );
}
