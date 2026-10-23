/**
 * @module application/jobs/job-recovery
 *
 * **A job cannot outlive the process that leased it.**
 *
 * Suite 13's promise is that work survives process death **or is reported lost honestly**: after a kill and
 * a restart the state is truthful (`expired`, lost, or explicitly reported unknown), and no still-`running`
 * job sits on the board as if the factory were working on it.
 *
 * Measured 2026-10-23 on suite 13's first run (`s13r1`, fresh data dir, git `33ef016`, `deepseek-flash`). The
 * worker and Core were `kill -9`ed with job `478faa26` in flight, and the stack was relaunched 10 s later:
 *
 * - The job still read `running` **after the restart** — `GET /api/v1/jobs` → `running: 1`, no
 *   `finishedAt`, no `error`. Nothing on serve reconciled it. The suite's own automated-tests row named a
 *   `recoverJobsAfterRestart` that does not exist anywhere in the tree.
 * - `zombieJobs` answered **0** on `GET /api/v1/runtime/status` in the same object that said
 *   `runningJobs: 1`, because `countZombieJobs` counts only leases that have already **expired**.
 * - And it was worse than a stale row: the replacement job queued for the same leaf (`b8c6e45e`) could not be
 *   leased at all, because `leaseNextJob` returns early when `workerHasActiveJob(workerId)` is true — and the
 *   killed job was still "active" **under the same worker id**. With a 30-minute lease, a kill wedged the
 *   execution plane for half an hour. Measured: 1 m 43 s of a queue that never moved, with the worker online
 *   and polling every couple of seconds.
 *
 * The rule this module enforces, and why it is safe without any heartbeat: **a lease is held by a living
 * process, so a lease that a *new* process finds on the books was held by a dead one.** Two moments say that
 * unambiguously — Core starting up (nothing had a lease before it existed), and a worker registering under an
 * id that already has an active job (this worker processes one job at a time, so its own active job belongs to
 * an earlier process with the same id). Both mark the job **`expired`** with `LEASE_ABANDONED`, which is the
 * word the suite asks for: lost and reported as lost, never silent, never `succeeded`.
 *
 * What it deliberately does not do: it never re-dispatches. Deciding whether a lost leaf should run again is
 * the line's job (`retry_work_item`, `execute_work_item`), and a recovery that queued work on its own would be
 * the factory starting jobs nobody asked for.
 */

import type { JournalStore } from "../../persistence/journal-store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { PmStore } from "../../persistence/pm-store.js";
import type { JobRecord, JobResultRecord, Store } from "../../persistence/store.js";
import { syncWorkItemFromJobResult } from "../pm/execute-work-item.js";
import type { CompletionRecipientContext } from "../pm/journal-events.js";

/** The code an abandoned lease carries. Distinct from `LEASE_EXPIRED` so a surface can tell *killed* from *timed out*. */
export const LEASE_ABANDONED_CODE = "LEASE_ABANDONED";

export interface RecoverContext {
  store: Store;
  pmStore: PmStore;
  journalStore?: JournalStore;
  memoryStore?: MemoryStore;
  completionCtx?: CompletionRecipientContext;
}

export interface RecoveryResult {
  recoveredJobs: string[];
  /** Work items the recovery moved out of `in_progress`, so a report can name what was lost. */
  workItemIds: string[];
}

function abandon(context: RecoverContext, job: JobRecord, why: string): JobResultRecord {
  const finishedAt = new Date().toISOString();
  context.store.appendJobLog(job.id, `Lease abandoned: ${why}`);
  return context.store.submitJobResult({
    jobId: job.id,
    leaseId: job.leaseId ?? `abandoned-${job.id}`,
    status: "expired",
    error: { code: LEASE_ABANDONED_CODE, message: why },
    finishedAt,
  });
}

function recover(context: RecoverContext, jobs: JobRecord[], why: string): RecoveryResult {
  const recoveredJobs: string[] = [];
  const workItemIds = new Set<string>();
  for (const job of jobs) {
    const result = abandon(context, job, why);
    const workItemId = (job.input as { context?: { workItemId?: string } } | undefined)?.context
      ?.workItemId;
    syncWorkItemFromJobResult(
      context.pmStore,
      job.id,
      result.status,
      context.journalStore,
      result,
      context.memoryStore,
      context.completionCtx,
    );
    recoveredJobs.push(job.id);
    if (workItemId) workItemIds.add(workItemId);
  }
  return { recoveredJobs, workItemIds: [...workItemIds] };
}

/**
 * Called once when Core starts serving. Every active lease on the books was held by a process that is gone,
 * because the store outlives the process and the lease does not.
 */
export function recoverAbandonedJobsOnBoot(context: RecoverContext): RecoveryResult {
  return recover(
    context,
    context.store.listActiveJobs(),
    "Core started with this job still leased: the process that held it is gone, so the work is lost " +
      "and is reported as lost rather than as running.",
  );
}

/**
 * Called when a worker registers. A worker runs one job at a time, so an active job under the id that just
 * registered was held by an earlier process with that id — the case that wedged the queue for 30 minutes on
 * `s13r1`, where `workerHasActiveJob` refused every lease while the killed job still read `running`.
 */
export function recoverAbandonedJobsForWorker(
  context: RecoverContext,
  workerId: string,
): RecoveryResult {
  return recover(
    context,
    context.store.listActiveJobs().filter((job) => job.workerId === workerId),
    `Worker ${workerId} registered while this job was still leased: the process that held it is gone, so ` +
      "the work is lost and is reported as lost rather than as running.",
  );
}
