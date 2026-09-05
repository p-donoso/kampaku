import type { JobResultRecord, Store } from "../../persistence/store.js";
import type { PmStore } from "../../persistence/pm-store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import { syncWorkItemFromJobResult } from "./execute-work-item.js";
import type { CompletionRecipientContext } from "./journal-events.js";

export const LEASE_EXPIRED_CODE = "LEASE_EXPIRED";

export function expireZombieJobs(store: Store): JobResultRecord[] {
  const results: JobResultRecord[] = [];
  for (const job of store.listExpiredActiveJobs()) {
    const finishedAt = new Date().toISOString();
    store.appendJobLog(job.id, "Lease expired; zombie job cancelled.");
    results.push(
      store.submitJobResult({
        jobId: job.id,
        leaseId: job.leaseId ?? `expired-${job.id}`,
        status: "expired",
        error: {
          code: LEASE_EXPIRED_CODE,
          message: "Job lease expired before the worker submitted a result.",
        },
        finishedAt,
      }),
    );
  }
  return results;
}

export function applyExpiredJobHygiene(
  store: Store,
  pmStore: PmStore,
  journalStore?: JournalStore,
  memoryStore?: MemoryStore,
  completionCtx?: CompletionRecipientContext,
): { expiredJobs: number } {
  const results = expireZombieJobs(store);
  const synced = new Set<string>();
  for (const result of results) {
    syncWorkItemFromJobResult(
      pmStore,
      result.jobId,
      result.status,
      journalStore,
      result,
      memoryStore,
      completionCtx,
    );
    synced.add(result.jobId);
  }

  for (const workItem of pmStore.listAllWorkItems()) {
    if (workItem.status !== "in_progress" || !workItem.jobId || synced.has(workItem.jobId)) continue;
    const job = store.getJob(workItem.jobId);
    if (job?.status !== "expired") continue;
    const result = store.getJobResult(workItem.jobId);
    syncWorkItemFromJobResult(
      pmStore,
      workItem.jobId,
      "expired",
      journalStore,
      result,
      memoryStore,
      completionCtx,
    );
  }

  return { expiredJobs: results.length };
}

export function countZombieJobs(store: Store): number {
  return store.listExpiredActiveJobs().length + store.countJobsByStatus("expired");
}
