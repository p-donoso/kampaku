import type { JobStatusResponse } from "../client/core-client.js";

export function printJobStatus(job: JobStatusResponse): void {
  console.log(`\n--- Job ---`);
  console.log(`ID:     ${job.id}`);
  console.log(`Status: ${job.status}`);
  if (job.error) {
    console.log(`Error:  ${JSON.stringify(job.error)}`);
  }
  if (job.output) {
    const summary =
      typeof job.output.summary === "string"
        ? job.output.summary
        : JSON.stringify(job.output);
    console.log(`Output: ${summary.slice(0, 500)}${summary.length > 500 ? "…" : ""}`);
  }
}

export function jobFailed(job: JobStatusResponse): boolean {
  return job.status !== "succeeded";
}
