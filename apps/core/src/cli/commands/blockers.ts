import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim, green, red } from "../ansi.js";
import { CoreClientError } from "../../client/core-client.js";

/**
 * `kampaku blockers` — read the escalations that freeze work items, and clear them.
 *
 * Why this command exists. `blockWorkItemAndDescendants` writes `blocked` into the work item a blocker is
 * raised against **and into every item under it**, and the freeze is only lifted by clearing the escalation
 * (`resumeWorkItemIfClear`). Until now nothing the operator held could do that: the HTTP route existed, the
 * agent tool existed (`resolve_blocker`), and the CLI had `questions` and no `blockers`. Measured 2026-10-02
 * on suite 08's third run `s08r10` (BOARD F-089): the container `8419cdbd` read `blocked` with two blockers
 * pending against it (`263514fb`, `c4880c7a`), the platform's own lead answered *"blocker `263514fb` names
 * **kampaku** (this desk) as its current recipient, and I hold no blocker-escalation tool"*, and the beat
 * stopped with seven items blocked and nothing on any surface naming either blocker.
 *
 * The verbs mirror the routes and the agent tools, and `resolve` requires both who decides and what they
 * decided: a blocker closed with no author is a status change, not a decision (the rule `disposeRisk`
 * enforces for risks and `projects closure` for closures).
 */
export function registerBlockersCommand(program: Command) {
  const blockers = program
    .command("blockers")
    .description("Read the escalations that freeze work items, and clear them");

  blockers
    .command("list")
    .description("List blockers, the ones still pending first")
    .option("--all", "Include the ones already resolved")
    .action(async (options: { all?: boolean }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const items = await client.listBlockers(options.all ? "resolved" : "pending");
        if (!items.length) {
          console.log(dim("No blockers."));
          return;
        }
        for (const blocker of items) {
          const holder = blocker.recipientAgentSlug ?? blocker.recipientAgentId;
          console.log(
            `${cyan(blocker.id)}  [${blocker.status}]  ` +
              `${blocker.reportedByAgentSlug ?? blocker.reportedByAgentId} → ${holder}`,
          );
          console.log(`  ${blocker.description.split("\n")[0]}`);
          if (blocker.status === "pending" && blocker.workItemId) {
            console.log(
              `  ${dim(
                `freezes work item ${blocker.workItemId} and everything under it — clear it with: ` +
                  `kampaku blockers resolve ${blocker.id} --by ${holder} --resolution "<what was decided>"`,
              )}`,
            );
          }
          if (blocker.resolution) console.log(`  ${dim(`resolution: ${blocker.resolution}`)}`);
        }
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  blockers
    .command("show")
    .description("Show one blocker: the report, who holds it, what it freezes, how it was closed")
    .argument("<blocker-id>")
    .action(async (blockerId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const pending = await client.listBlockers("pending");
        const blocker =
          pending.find((item) => item.id === blockerId) ??
          (await client.listBlockers("resolved")).find((item) => item.id === blockerId);
        if (!blocker) {
          console.error(red(`No blocker ${blockerId}.`));
          process.exitCode = 1;
          return;
        }
        console.log(`${blocker.id}  [${blocker.status}]`);
        console.log(
          `  reported by ${blocker.reportedByAgentSlug ?? blocker.reportedByAgentId} → held by ` +
            `${blocker.recipientAgentSlug ?? blocker.recipientAgentId}`,
        );
        console.log(`  ${blocker.description}`);
        if (blocker.context) console.log(`  ${dim(blocker.context)}`);
        if (blocker.workItemId) console.log(`  freezes work item ${blocker.workItemId}`);
        if (blocker.createdAt) console.log(`  ${dim(`raised ${blocker.createdAt}`)}`);
        if (blocker.resolution) console.log(`  resolution (${blocker.resolutionKind}): ${blocker.resolution}`);
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  blockers
    .command("resolve")
    .description("Clear a pending blocker: resumes the work item it froze, and its descendants' statuses")
    .argument("<blocker-id>")
    .requiredOption("--by <who>", "Who holds it: the current recipient, as a slug or an id (see blockers list)")
    .requiredOption("--resolution <text>", "What was decided, in the resolver's own words")
    .action(async (blockerId: string, options: { by: string; resolution: string }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const blocker = await client.resolveBlocker(blockerId, options.resolution, options.by);
        console.log(green(`${blocker.id} is ${blocker.status}.`));
        console.log(
          dim(
            blocker.workItemId
              ? `Read back: kampaku projects blocked <project>, then kampaku projects show <project> ` +
                  `(the work item it froze was ${blocker.workItemId}).`
              : "Read back: kampaku blockers list --all.",
          ),
        );
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exitCode = 1;
          return;
        }
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}
