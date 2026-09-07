/**
 * @module job-runner/control
 * Job cancellation, pause, and lifecycle signaling for the Worker runtime.
 */

/**
 * Signals governing whether execution should continue, pause, or terminate.
 */
export type JobControlSignal = "continue" | "pause" | "cancel";

/**
 * Error thrown when a leased job is paused by the operator or Core plane.
 */
export class JobPausedError extends Error {
  constructor() {
    super("Job paused.");
    this.name = "JobPausedError";
  }
}

/**
 * Error thrown when a leased job is cancelled by the operator or Core plane.
 */
export class JobCancelledError extends Error {
  constructor() {
    super("Job cancelled.");
    this.name = "JobCancelledError";
  }
}

/**
 * Interface for checking dynamic lifecycle signals during long-running tasks.
 */
export interface JobControl {
  /** Checks current job status and returns a control signal */
  check(): Promise<JobControlSignal>;
}

/**
 * Factory creating a `JobControl` instance given a status retrieval callback.
 *
 * @param fetchStatus - Async function returning the latest job status object or null.
 * @returns Configured `JobControl`.
 */
export function createJobControl(
  fetchStatus: () => Promise<{ status: string } | null>,
): JobControl {
  return {
    async check(): Promise<JobControlSignal> {
      const job = await fetchStatus();
      if (!job) return "continue";
      if (job.status === "paused") return "pause";
      if (job.status === "cancelled") return "cancel";
      return "continue";
    },
  };
}

/**
 * Asserts that the currently running job has not been paused or cancelled.
 *
 * @param control - Optional `JobControl` tracker.
 * @throws `JobPausedError` if the job was marked paused.
 * @throws `JobCancelledError` if the job was marked cancelled.
 */
export async function assertJobContinuing(control?: JobControl): Promise<void> {
  if (!control) return;
  const signal = await control.check();
  if (signal === "pause") throw new JobPausedError();
  if (signal === "cancel") throw new JobCancelledError();
}
