import type { JobRecord, JobResultRecord, Store } from "../../persistence/store.js";

export class JobControlError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT",
  ) {
    super(message);
    this.name = "JobControlError";
  }
}

const PAUSABLE_STATUSES = new Set<JobRecord["status"]>(["queued", "leased", "running"]);
const CANCELLABLE_STATUSES = new Set<JobRecord["status"]>(["queued", "leased", "running", "paused"]);

export function pauseJob(store: Store, jobId: string): JobRecord {
  const job = store.getJob(jobId);
  if (!job) throw new JobControlError("Job not found.", "NOT_FOUND");
  if (!PAUSABLE_STATUSES.has(job.status)) {
    throw new JobControlError(`Job cannot be paused while ${job.status}.`, "CONFLICT");
  }

  store.pauseJob(jobId);
  const updated = store.getJob(jobId);
  if (!updated) throw new JobControlError("Job not found.", "NOT_FOUND");
  return updated;
}

export function resumeJob(store: Store, jobId: string): JobRecord {
  const job = store.getJob(jobId);
  if (!job) throw new JobControlError("Job not found.", "NOT_FOUND");
  if (job.status !== "paused") {
    throw new JobControlError(`Job cannot be resumed while ${job.status}.`, "CONFLICT");
  }

  store.resumeJob(jobId);
  const updated = store.getJob(jobId);
  if (!updated) throw new JobControlError("Job not found.", "NOT_FOUND");
  return updated;
}

export function cancelJob(store: Store, jobId: string): JobResultRecord {
  const job = store.getJob(jobId);
  if (!job) throw new JobControlError("Job not found.", "NOT_FOUND");
  if (!CANCELLABLE_STATUSES.has(job.status)) {
    throw new JobControlError(`Job cannot be cancelled while ${job.status}.`, "CONFLICT");
  }

  const finishedAt = new Date().toISOString();
  const leaseId = job.leaseId ?? `cancel-${jobId}`;

  store.appendJobLog(jobId, "Job cancelled by user.");
  return store.submitJobResult({
    jobId,
    leaseId,
    status: "cancelled",
    error: { code: "USER_CANCELLED", message: "Job cancelled by user." },
    finishedAt,
  });
}
