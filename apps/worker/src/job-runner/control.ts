export type JobControlSignal = "continue" | "pause" | "cancel";

export class JobPausedError extends Error {
  constructor() {
    super("Job paused.");
    this.name = "JobPausedError";
  }
}

export class JobCancelledError extends Error {
  constructor() {
    super("Job cancelled.");
    this.name = "JobCancelledError";
  }
}

export interface JobControl {
  check(): Promise<JobControlSignal>;
}

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

export async function assertJobContinuing(control?: JobControl): Promise<void> {
  if (!control) return;
  const signal = await control.check();
  if (signal === "pause") throw new JobPausedError();
  if (signal === "cancel") throw new JobCancelledError();
}
