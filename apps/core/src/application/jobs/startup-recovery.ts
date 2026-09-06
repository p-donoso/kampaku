import type { JobResultRecord, Store } from "../../persistence/store.js";
import type { PmStore } from "../../persistence/pm-store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import { applyExpiredJobHygiene } from "../pm/queue-hygiene.js";
import { syncWorkItemFromJobResult } from "../pm/execute-work-item.js";
import type { CompletionRecipientContext } from "../pm/journal-events.js";

export const PROCESS_RESTART_CODE = "PROCESS_RESTART";

/**
 * After a hard process kill, any still-active leases are orphans.
 * Mark them expired so status is not a silent "still running" green lie.
 */
export function expireOrphanJobsAfterRestart(store: Store): JobResultRecord[] {
  const results: JobResultRecord[] = [];
  const orphans = store
    .listAllJobs()
    .filter((job) => job.status === "running" || job.status === "leased");

  for (const job of orphans) {
    const finishedAt = new Date().toISOString();
    store.appendJobLog(
      job.id,
      "Control plane restarted; orphan active job marked expired (lost — not still running).",
    );
    results.push(
      store.submitJobResult({
        jobId: job.id,
        leaseId: job.leaseId ?? `restart-${job.id}`,
        status: "expired",
        error: {
          code: PROCESS_RESTART_CODE,
          message:
            "Job was active when the control plane restarted. Progress may be lost; status is expired (not running).",
        },
        finishedAt,
      }),
    );
  }
  return results;
}

export function recoverJobsAfterRestart(
  store: Store,
  pmStore: PmStore,
  journalStore?: JournalStore,
  memoryStore?: MemoryStore,
  completionCtx?: CompletionRecipientContext,
): { expiredJobs: number; orphanJobs: number } {
  const leaseHygiene = applyExpiredJobHygiene(
    store,
    pmStore,
    journalStore,
    memoryStore,
    completionCtx,
  );
  const orphanResults = expireOrphanJobsAfterRestart(store);
  for (const result of orphanResults) {
    syncWorkItemFromJobResult(
      pmStore,
      result.jobId,
      result.status,
      journalStore,
      result,
      memoryStore,
      completionCtx,
    );
  }
  return {
    expiredJobs: leaseHygiene.expiredJobs,
    orphanJobs: orphanResults.length,
  };
}
