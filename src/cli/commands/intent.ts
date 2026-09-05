import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { CoreClientError } from "../../client/core-client.js";
import { red } from "../ansi.js";

export function registerIntentCommand(program: Command) {
  program
    .command("intent")
    .description("Submit an intent for organic project planning and delegation")
    .argument("<text...>", "Intent in natural language")
    .option("--project-slug <slug>", "Existing or preferred project slug")
    .action(async (textParts: string[], options: { projectSlug?: string }) => {
      const intent = textParts.join(" ").trim();
      if (!intent) {
        console.error(red("Intent text is required."));
        process.exit(1);
      }

      const client = createCoreClient(createAppContext().config);

      try {
        const result = await client.submitIntent({
          intent,
          projectSlug: options.projectSlug,
        });
        console.log(result.summary);
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });
}
