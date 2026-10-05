import type { JobListResponse, JobStatusResponse } from "../client/core-client.js";
import { dim, red } from "./ansi.js";

/** `2026-10-04T23:46:07.082Z` → `2026-10-04 23:46:07` — readable, and still the stored instant. */
export function formatJobTime(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 19).replace("T", " ");
}

function formatTotals(totals: Record<string, number>): string {
  const parts = Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status} ${count}`);
  return parts.length > 0 ? parts.join(", ") : "none";
}

/**
 * The job list as an operator reads it (BOARD F-078).
 *
 * Not a column of ids: an id alone repeats the defect one level up. Each row names the status, the work
 * item the job was dispatched for (and the project, when it belongs to one), and its times — and a row
 * with no work item says `unattached` rather than printing an empty cell, because an orphan is the thing
 * an operator came to this list to find.
 */
export function printJobList(page: JobListResponse): void {
  if (page.jobs.length === 0) {
    console.log(
      `No jobs match (${page.total} matching). Store totals: ${formatTotals(page.totals)}.`,
    );
    return;
  }

  console.log(`\n--- Jobs (${page.returned} of ${page.total} matching) ---`);
  for (const job of page.jobs) {
    const where = job.workItemTitle
      ? `${job.workItemTitle}${job.workItemId ? dim(` (${job.workItemId.slice(0, 8)})`) : ""}${
          job.projectSlug ? dim(` · project ${job.projectSlug}`) : ""
        }`
      : job.workItemId
        ? `work item ${job.workItemId}`
        : red("unattached — no work item points at this job");
    console.log(`${job.id}  ${job.status}`);
    console.log(`  work:   ${where}`);
    if (job.goalId) console.log(`  goal:   ${job.goalId}`);
    console.log(
      `  times:  queued ${formatJobTime(job.createdAt)} · started ${formatJobTime(job.startedAt)} · ` +
        `finished ${formatJobTime(job.finishedAt)}`,
    );
    if (job.error) console.log(`  error:  ${JSON.stringify(job.error)}`);
  }
  console.log(dim(`store totals: ${formatTotals(page.totals)}`));
}

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
