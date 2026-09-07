"use client";

import { useEffect, useState } from "react";
import { RuntimeStatusBanner } from "@/components/execution/execution-status";
import type { RuntimeStatus } from "@/lib/types";

export function DashboardRuntimeStatus() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const { getRuntimeStatus } = await import("@/lib/api");
        const status = await getRuntimeStatus();
        if (!cancelled) setRuntime(status);
      } catch {
        /* ignore */
      }
    }

    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!runtime) return null;

  const hasActivity = runtime.queuedJobs > 0 || runtime.runningJobs > 0;

  return (
    <div className="mb-6">
      {hasActivity ? (
        <RuntimeStatusBanner runtime={runtime} />
      ) : (
        <div className="rounded-xl border border-border bg-surface/40 px-4 py-2 text-xs text-muted">
          Worker{runtime.workersOnline !== 1 ? "s" : ""}: {runtime.workersOnline}
          {runtime.workersOnline === 0 && " — start with make dev"}
        </div>
      )}
    </div>
  );
}
