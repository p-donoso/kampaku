import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { printAudit } from "../output.js";

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Show the latest goal audit trail")
    .option("--last", "Show the most recent goal", true)
    .option("--goal-id <id>", "Specific goal ID")
    .action(async (options: { goalId?: string }) => {
      const { config } = createAppContext();
      const client = createCoreClient(config);

      let goalId = options.goalId;
      if (!goalId) {
        const goals = await client.listGoals({ limit: 1 });
        goalId = goals[0]?.id;
      }

      if (!goalId) {
        console.error("No goals found.");
        process.exit(1);
      }

      const audit = await client.getGoalAudit(goalId);
      printAudit(audit);
    });
}
