import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { jobFailed, printJobStatus } from "../jobs-output.js";

export function registerJobsCommand(program: Command) {
  const jobs = program.command("jobs").description("Inspect and monitor worker jobs");

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
