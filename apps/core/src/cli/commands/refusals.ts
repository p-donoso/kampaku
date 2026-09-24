import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";

/**
 * `kampaku refusals` — what the factory declined to accept, and which boundary it crossed.
 *
 * The durable counterpart to a refusal spoken in chat. Without this, the operator could not see that a
 * request was turned away, and the boundary could not be reviewed or counted.
 */
export function registerRefusalCommands(program: Command): void {
  const refusals = program
    .command("refusals")
    .description("Inspect work the factory refused as out of scope");

  refusals
    .command("list")
    .description("List recorded refusals")
    .option("--boundary <boundary>", "Filter by the boundary that was crossed")
    .action(async (options: { boundary?: string }) => {
      const client = createCoreClient(createAppContext().config);
      const result = await client.listRefusals(options.boundary);
      if (result.refusals.length === 0) {
        console.log("No refusals recorded.");
        return;
      }
      for (const refusal of result.refusals) {
        console.log(`${refusal.id}  ${refusal.boundary}  ${refusal.createdAt}`);
        console.log(`  request: ${refusal.request.slice(0, 120)}`);
        console.log(`  boundary: ${refusal.boundaryStatement}`);
      }
      console.log(`\n${result.total} refusal${result.total === 1 ? "" : "s"}.`);
    });

  refusals
    .command("show")
    .description("Show one recorded refusal")
    .argument("<id>", "Refusal id")
    .action(async (id: string) => {
      const client = createCoreClient(createAppContext().config);
      const result = await client.getRefusal(id);
      console.log(JSON.stringify(result.refusal, null, 2));
    });
}
