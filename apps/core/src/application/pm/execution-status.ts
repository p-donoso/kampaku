import type { JobRecord } from "../../persistence/store.js";
import type { Store } from "../../persistence/store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";

export type ExecutionPhase = "idle" | "queued" | "running" | "done" | "failed";

export interface RuntimeStatus {
  workersOnline: number;
  queuedJobs: number;
  runningJobs: number;
  zombieJobs: number;
}

export function getRuntimeStatus(store: Store): RuntimeStatus {
  return {
    workersOnline: store.listWorkers().length,
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
