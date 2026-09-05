import { jobInputSchema, CoreClient } from "../worker-api/client.js";
import { JobCancelledError, JobPausedError } from "./control.js";
import { createSandbox } from "../sandbox/workspace.js";
import { assertPathWritable } from "../sandbox/path-policy.js";
import { executeJob } from "../executor/session.js";
import type { WorkerConfig } from "../config.js";
import { REPOSITORY_DIRS } from "../config.js";
import { join } from "node:path";

export async function runJobLoop(config: WorkerConfig): Promise<void> {
  const client = new CoreClient(config.coreUrl, config.workerId);
  await client.waitUntilReady();
  await client.registerWorker();
  console.log(`Worker ${config.workerId} registered. Polling for jobs...`);

  while (true) {
    try {
      const job = await client.leaseJob();
      if (!job) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      console.log(`Leased job ${job.id}`);
      const input = jobInputSchema.parse(job.input);
      const repoPath = join(config.workspaceRoot, REPOSITORY_DIRS[input.repositoryRole]);

      if (input.filesystemPolicy) {
        try {
          assertPathWritable(repoPath, input.filesystemPolicy);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Filesystem policy violation";
          await client.submitResult({
            jobId: job.id,
            leaseId: job.leaseId,
            status: "failed",
            error: { code: "FILESYSTEM_POLICY", message },
            finishedAt: new Date().toISOString(),
          });
          console.log(`Job ${job.id} failed: ${message}`);
          continue;
        }
      }

      const sandbox = createSandbox(job.id, config.workspaceRoot, input.repositoryRole, {
        repositoryPath: input.repositoryPath,
        workspaceDir: input.workspaceDir,
      });
      const progress = client.createProgressReporter(job.id, job.leaseId);
      const control = client.createJobControl(job.id);
      progress.log(`Worker leased job for ${input.repositoryRole} repository.`);

      try {
        const result = await executeJob(input, sandbox.path, config, {
          jobId: job.id,
          leaseId: job.leaseId,
          progress,
          control,
        });
        progress.log(`Submitting result: ${result.status}`);
        await client.submitResult({
          jobId: job.id,
          leaseId: job.leaseId,
          status: result.status,
          output: result.output,
          error: result.error,
          finishedAt: new Date().toISOString(),
        });
        console.log(`Job ${job.id} ${result.status}`);
      } catch (error) {
        if (error instanceof JobPausedError) {
          progress.log("Worker stopped because the job was paused.");
          console.log(`Job ${job.id} paused`);
        } else if (error instanceof JobCancelledError) {
          progress.log("Worker stopped because the job was cancelled.");
          console.log(`Job ${job.id} cancelled`);
        } else {
          throw error;
        }
      } finally {
        sandbox.cleanup();
      }
    } catch (error) {
      console.error("Worker loop error:", error);
      await sleep(config.pollIntervalMs);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
