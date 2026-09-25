import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { printAgentTree } from "../agents-output.js";
import { dim, green, red, yellow } from "../ansi.js";
import { CoreClientError } from "../../client/core-client.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerAgentsCommand(program: Command) {
  const agents = program
    .command("agents")
    .description("Inspect and manage generated agents");

  agents
    .command("tree")
    .description("Show agent hierarchy")
    .action(async () => {
      const client = createCoreClient(createAppContext().config);
      const { tree } = await client.listAgents({ tree: true });
      if (!tree?.length) {
        console.log("No agents found.");
        return;
      }
      printAgentTree(tree);
    });

  agents
    .command("show")
    .description("Show agent details")
    .argument("<slug-or-id>", "Agent slug or ID")
    .action(async (slugOrId: string) => {
      const client = createCoreClient(createAppContext().config);
      const agent = await client.getAgent(slugOrId);
      console.log(`Slug:             ${agent.slug}`);
      console.log(`Name:             ${agent.name}`);
      console.log(`Source:           ${agent.source}`);
      console.log(`Status:           ${agent.status}`);
      console.log(`Parent:           ${agent.parentId ?? "(root)"}`);
      console.log(`Responsibilities: ${agent.responsibilities}`);
      console.log("");
      console.log("System prompt:");
      console.log(agent.systemPrompt);
    });

  agents
    .command("update")
    .description("Update a generated sub-agent")
    .argument("<slug-or-id>", "Agent slug or ID")
    .option("--name <name>", "Display name")
    .option("--responsibilities <text>", "Responsibilities")
    .option("--system-prompt <text>", "System prompt")
    .option("--parent <slug>", "Parent agent slug")
    .action(async (slugOrId: string, options: {
      name?: string;
      responsibilities?: string;
      systemPrompt?: string;
      parent?: string;
    }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const agent = await client.updateAgent(slugOrId, {
          name: options.name,
          responsibilities: options.responsibilities,
          system_prompt: options.systemPrompt,
          parent_slug: options.parent,
        });
        console.log(`Updated agent "${agent.slug}".`);
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  agents
    .command("delete")
    .description("Delete a generated sub-agent")
    .argument("<slug-or-id>", "Agent slug or ID")
    .option("-y, --yes", "Skip confirmation")
    .action(async (slugOrId: string, options: DeleteOptions) => {
      const client = createCoreClient(createAppContext().config);

      if (!options.yes) {
        console.log(dim(`Use --yes to delete agent "${slugOrId}".`));
        return;
      }

      try {
        // Two phases, because `-y` has to reach the route now. The first call has **no effect**: it records
        // the request and returns the consequence in words. Passing `-y` is what presents the confirmation
        // the server minted, so a caller without the flag — including one that never touches this CLI —
        // cannot make the route act.
        const challenge = await client.deleteAgent(slugOrId);
        if (challenge) {
          console.log(yellow(challenge.consequence));
          await client.deleteAgent(slugOrId, {
            reference: challenge.reference,
            confirmationToken: challenge.confirmationToken,
            confirmedBy: "cli",
          });
        }
        console.log(green(`Deleted agent "${slugOrId}".`));
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });
}
