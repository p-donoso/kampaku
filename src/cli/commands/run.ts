import type { Command } from "commander";
import type { RepositoryRole } from "../../config.js";
import { createAppContext, createCoreClient } from "../context.js";
import { auditFailed, submitGoal } from "../goals.js";
import { printAudit } from "../output.js";

export function registerRunCommand(program: Command) {
  program
    .command("run")
    .description("Submit a goal and wait for job completion")
    .argument("<objective>", "High-level objective for the agent")
    .option("--repo <role>", "Target repository role", "core")
    .option("--project-id <id>", "Project ID (defaults to bootstrapped project)")
    .action(async (objective: string, options: { repo: string; projectId?: string }) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);

      try {
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
