/**
 * @module application/jobs/work-item-jobs
 *
 * **Cancelling work cancels the work, not the record.**
 *
 * Suite 13's oracle: *cancel stops the job — the job reaches a terminal non-success status and its artifacts
 * stop changing*. Measured twice as false, on two suites, and both times the platform reported nothing:
 *
 * - 2026-10-04, suite 08's run `s08r11` (BOARD F-096): the lead cancelled a badly scoped slice, the item read
 *   `cancelled`, and the job queued beneath it was still leased and **ran to `succeeded`**, rewriting two files
 *   the plan had frozen.
 * - 2026-10-23, suite 13's run `s13r1`: asked to *cancel the running work on this project*, the front office
 *   cancelled the leaf and the container through the lead — and the job in flight (`b8c6e45e`) kept running,
 *   because *the lead holds no job-cancel operation*. The reply said so plainly, which is the honest half and
 *   still leaves the job running.
 *
 * So the cancellation rides the status change that means it. One implementation, called by both surfaces that
 * can cancel a work item (the `update_work_item` tool and `PATCH /api/v1/work-items/:id`), because a rule that
 * lives in one call site protects one call site.
 *
 * The job→item link is read from **the job's own input** (`input.context.workItemId`, written at dispatch),
 * never from the item's `jobId`: on suite 08's run every item's `jobId` was `null` once its job settled, which
 * is the same reason `GET /api/v1/jobs` resolves its rows that way (BOARD F-078).
 */

import type { JobResultRecord, Store } from "../../persistence/store.js";

/** Statuses a cancel may move. A settled job is a record, not work in flight. */
const CANCELLABLE = new Set(["queued", "leased", "running", "paused"]);

export const WORK_ITEM_CANCELLED_CODE = "WORK_ITEM_CANCELLED";
export const WORK_ITEM_SUPERSEDED_CODE = "WORK_ITEM_SUPERSEDED";

/**
 * Cancel every job dispatched for `workItemId` that has not settled.
 *
 * The reason names the item, so a job's own record says *why* it stopped instead of leaving an operator to
 * infer it from a status change somewhere else.
 */
export function cancelJobsForWorkItem(
  store: Store,
  workItemId: string,
  reason?: string,
  errorCode = WORK_ITEM_CANCELLED_CODE,
): JobResultRecord[] {
  const detail =
    reason?.trim() ||
    `The work item this job was dispatched for (${workItemId}) was cancelled, so the job was cancelled with it.`;
  const cancelled: JobResultRecord[] = [];
  for (const job of store.listActiveJobs()) {
    if (job.status === "paused") continue;
    const dispatchedFor = (job.input as { context?: { workItemId?: string } } | undefined)?.context
      ?.workItemId;
    if (dispatchedFor !== workItemId) continue;
    store.appendJobLog(job.id, `Job cancelled: ${detail}`);
    cancelled.push(
      store.submitJobResult({
        jobId: job.id,
        leaseId: job.leaseId ?? `cancel-${job.id}`,
        status: "cancelled",
        error: { code: errorCode, message: detail },
        finishedAt: new Date().toISOString(),
      }),
    );
  }
  // A paused job is deliberately left to its own control: pausing is an operator act with its own resume, and
  // a cancel that also consumed it would make "pause" a one-way door. The list above is what the caller reports.
  for (const job of store.listActiveJobs()) {
    if (job.status !== "paused") continue;
    const dispatchedFor = (job.input as { context?: { workItemId?: string } } | undefined)?.context
      ?.workItemId;
    if (dispatchedFor !== workItemId) continue;
    store.appendJobLog(job.id, `Job left paused (not cancelled): ${detail}`);
  }
  return cancelled;
}

/** True when a job status is one a cancel can still move. Exported so a surface can say so before it tries. */
export function isCancellableJobStatus(status: string): boolean {
  return CANCELLABLE.has(status);
}
