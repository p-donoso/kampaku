import type { Command } from "commander";
import type { RepositoryRole } from "../../config.js";
import { createAppContext, createCoreClient } from "../context.js";
import { auditFailed, submitGoal } from "../goals.js";
import { isUuid, resolveExecutionTarget } from "../execution-target.js";
import { jobFailed, printJobStatus } from "../jobs-output.js";
import { printAudit } from "../output.js";

export function registerRunCommand(program: Command) {
  program
    .command("run")
    .description("Submit a goal and wait for job completion")
    .argument("<objective>", "High-level objective, or an existing goal/job UUID")
    .option("--repo <role>", "Target repository role", "core")
    .option("--project-id <id>", "Project ID (defaults to bootstrapped project)")
    .action(async (objective: string, options: { repo: string; projectId?: string }) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);

      try {
        if (isUuid(objective)) {
          const target = await resolveExecutionTarget(client, objective);
          if (target.kind === "job") {
            console.log(`Detected job ID — watching existing job (use kampaku jobs watch for clarity).`);
            const job = await client.waitForJob(objective);
            printJobStatus(job);
            process.exit(jobFailed(job) ? 1 : 0);
            return;
          }
          if (target.kind === "goal") {
            console.log(`Detected goal ID — waiting for goal completion.`);
            const audit = await client.waitForGoal(objective);
            printAudit(audit);
            process.exit(auditFailed(audit) ? 1 : 0);
            return;
          }
          console.error(
            `No job or goal found for ID ${objective}.\n` +
              "`kampaku run` with a UUID only works for existing goal/job IDs.\n" +
              "To watch a job after projects step: kampaku jobs watch <jobId>",
          );
          process.exit(1);
          return;
        }

        const audit = await submitGoal(
          client,
          {
            repo: options.repo as RepositoryRole,
            projectId: options.projectId,
          },
          objective,
        );
        printAudit(audit);
        process.exit(auditFailed(audit) ? 1 : 0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });
}
