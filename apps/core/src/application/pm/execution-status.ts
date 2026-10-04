import type { JobRecord } from "../../persistence/store.js";
import type { Store } from "../../persistence/store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";

export type ExecutionPhase = "idle" | "queued" | "running" | "done" | "failed";

export interface RuntimeStatus {
  workersOnline: number;
  /**
   * How many workers have ever registered, whether or not they are still there.
   *
   * Separate from `workersOnline` so the two questions stay distinguishable: a stack that starts and
   * shows `0` used to be indistinguishable from one whose worker died a minute ago, and those need
   * different things done about them.
   */
  workersKnown: number;
  queuedJobs: number;
  runningJobs: number;
  zombieJobs: number;
}

/**
 * How long a worker may go unheard from **while it holds no job** before it stops counting as online.
 *
 * The worker polls for work every couple of seconds (`KAMPAKU_POLL_INTERVAL_MS`, default 2 000), and
 * that poll is its heartbeat — but the poll is also the loop's own head, so a worker that has leased a
 * job sends nothing until that job finishes. "Much longer than a handful of polls" therefore does not
 * mean gone; it is what a job in flight looks like. This bound applies to a worker with no live lease,
 * and a worker holding one is online however long it has been quiet (see `getRuntimeStatus`).
 *
 * The sentence that used to stand here — that anything beyond a handful of polls "is gone rather than
 * busy" — was measured false on 2026-10-04 (BOARD F-095): a worker four minutes into a job read as
 * `workersOnline: 0` beside `runningJobs: 1`.
 */
export const WORKER_STALE_AFTER_MS = 30_000;

/**
 * The runtime card's numbers, from sightings rather than from rows.
 *
 * Measured 2026-09-29 opening suite 08 (BOARD F-074): a worker killed 25 s earlier still read as
 * online, because the only liveness signal was a row written once at registration. The consequence is
 * not cosmetic — `GET /api/v1/runtime/status` is the surface an operator (and `scripts/start.sh`) uses
 * to decide whether an execution plane exists, and a number that never decreases cannot answer that.
 *
 * **A worker holding a live job lease is online, whatever its heartbeat says.** The heartbeat is the
 * poll for work, so a worker that is executing is silent by construction — and the round that fixed
 * F-074 stopped at "a sighting is required", which made every job longer than the staleness window
 * read as a dead execution plane. Measured 2026-10-04 (BOARD F-095) on suite 08's fourth re-run: a
 * worker four minutes into a job answered `{"workersOnline":0,"workersKnown":1,"runningJobs":1}`.
 * Both readings were wrong in opposite directions, and the distinction they were missing is the one
 * this function's own doc used to claim: *busy* is not *gone*.
 */
export function getRuntimeStatus(
  store: Store,
  options: { now?: Date; staleAfterMs?: number } = {},
): RuntimeStatus {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? WORKER_STALE_AFTER_MS;
  const workers = store.listWorkers();
  const online = workers.filter((worker) => {
    if (store.workerHoldsLiveLease(worker.id, now)) return true;
    const seenAt = worker.lastSeenAt ?? worker.registeredAt;
    const seen = Date.parse(seenAt);
    if (Number.isNaN(seen)) return false;
    return now.getTime() - seen <= staleAfterMs;
  });
  return {
    workersOnline: online.length,
    workersKnown: workers.length,
    queuedJobs: store.countJobsByStatus("queued"),
    runningJobs:
      store.countJobsByStatus("running") + store.countJobsByStatus("leased"),
    zombieJobs: store.listExpiredActiveJobs().length + store.countJobsByStatus("expired"),
  };
}

export function resolveExecutionPhase(
  workItem: WorkItemRecord,
  job?: JobRecord,
): ExecutionPhase {
  if (workItem.status === "done") return "done";
  if (workItem.status === "blocked") return "failed";
  if (!workItem.jobId && workItem.status !== "in_progress") return "idle";

  if (!job) {
    return workItem.status === "in_progress" ? "queued" : "idle";
  }

  if (job.status === "queued") return "queued";
  if (job.status === "leased" || job.status === "running") return "running";
  if (job.status === "succeeded") return "done";
  return "failed";
}

export function executionPhaseLabel(phase: ExecutionPhase): string {
  switch (phase) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "";
  }
}

export function enrichWorkItemExecution(
  workItem: WorkItemRecord,
  store: Store,
): WorkItemRecord & {
  jobStatus?: JobRecord["status"];
  executionPhase: ExecutionPhase;
  executionLabel: string;
} {
  const job = workItem.jobId ? store.getJob(workItem.jobId) : undefined;
  const executionPhase = resolveExecutionPhase(workItem, job);
  return {
    ...workItem,
    jobStatus: job?.status,
    executionPhase,
    executionLabel: executionPhaseLabel(executionPhase),
  };
}
