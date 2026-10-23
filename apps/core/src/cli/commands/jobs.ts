import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { jobFailed, printJobList, printJobStatus } from "../jobs-output.js";

/**
 * `kampaku jobs` — the execution plane, without an id in hand first.
 *
 * Measured three times on suite 08's live instances (BOARD F-078): `jobs --help` offered only
 * `show <jobId>` and `watch <jobId>`, so a job was reachable **only if you already had its id**, while
 * `GET /api/v1/runtime/status` reported `queuedJobs`/`runningJobs` as counts with no surface that could
 * resolve them. `jobs list` is that surface, and it answers from the same route the web reads.
 */
export function registerJobsCommand(program: Command) {
  const jobs = program.command("jobs").description("List, inspect and monitor worker jobs");

  jobs
    .command("list")
    .description("List jobs — no id needed; the read that resolves queuedJobs/runningJobs into rows")
    .option(
      "--status <status>",
      "Filter by status (queued, leased, running, paused, succeeded, failed, cancelled, expired) " +
        "or by an alias: active, running, done, terminal",
    )
    .option(
      "--project <project>",
      "Filter to a project (slug or id). Omit it to include jobs attached to no work item",
    )
    .option("--limit <n>", "Maximum rows", "50")
    .option("--json", "Print the response as JSON")
    .action(async (options: { status?: string; project?: string; limit: string; json?: boolean }) => {
      const limit = Number(options.limit);
      if (!Number.isFinite(limit) || limit < 1) {
        console.error(`--limit must be a positive number, got "${options.limit}".`);
        process.exit(1);
      }
      const { config } = createAppContext();
      const client = createCoreClient(config);
      const page = await client.listJobs({
        status: options.status,
        project: options.project,
        limit,
      });
      if (options.json) {
        console.log(JSON.stringify(page, null, 2));
        return;
      }
      printJobList(page);
    });

  jobs
    .command("watch")
    .description("Poll an existing job until it reaches a terminal status")
    .argument("<jobId>", "Existing job UUID from projects step or execute_work_item")
    .option("--timeout <ms>", "Max wait time in milliseconds", "600000")
    .action(async (jobId: string, options: { timeout: string }) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);

      const existing = await client.getJob(jobId);
      if (!existing) {
        console.error(
          `Job not found: ${jobId}\n` +
            "Tip: `kampaku run` submits a new goal — it does not watch an existing job. Use `kampaku jobs watch <jobId>`.",
        );
        process.exit(1);
      }

      console.log(`Watching job ${jobId} (current status: ${existing.status})…`);
      const job = await client.waitForJob(jobId, {
        timeoutMs: Number(options.timeout),
      });
      printJobStatus(job);
      process.exit(jobFailed(job) ? 1 : 0);
    });

  jobs
    .command("cancel")
    .description("Cancel a job — stops work already in flight; it reaches `cancelled`, never `succeeded`")
    .argument("<jobId>", "Job UUID (from `kampaku jobs list` or a project's execution surface)")
    .action(async (jobId: string) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);
      try {
        const result = await client.cancelJob(jobId);
        console.log(`Job ${jobId} is ${result.status}.`);
        const error = result.error as { code?: string; message?: string } | undefined;
        if (error?.message) console.log(`${error.code ?? ""} ${error.message}`.trim());
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  jobs
    .command("show")
    .description("Show the current status of a job")
    .argument("<jobId>", "Job UUID")
    .action(async (jobId: string) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);
      const job = await client.getJob(jobId);
      if (!job) {
        console.error(`Job not found: ${jobId}`);
        process.exit(1);
      }
      printJobStatus(job);
    });
}
