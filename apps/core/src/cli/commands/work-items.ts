import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";

export function registerWorkItemsCommand(program: Command) {
  const workItems = program.command("work-items").description("Execute and retry project work items");

  workItems
    .command("retry")
    .description("Reset a blocked work item and start a fresh execution attempt")
    .argument("<workItemId>", "Work item UUID")
    .action(async (workItemId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const result = await client.retryWorkItem(workItemId);
        console.log(`Fresh execution started for ${result.workItemId}.`);
        console.log(`job=${result.jobId ?? "none"}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
