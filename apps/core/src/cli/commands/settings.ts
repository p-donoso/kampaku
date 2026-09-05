import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim, green, red } from "../ansi.js";
import { CoreClientError } from "../../client/core-client.js";

export function registerSettingsCommand(program: Command) {
  const settings = program.command("settings").description("Global Kampaku settings");

  const globalPrompt = settings.command("global-prompt").description("Manage the prompt prepended to every agent");

  globalPrompt.command("show").description("Show the global system prompt").action(async () => {
    const client = createCoreClient(createAppContext().config);
    const result = await client.getGlobalSystemPromptSettings();
    console.log(result.prompt);
  });

  globalPrompt.command("set").description("Replace the global system prompt")
    .argument("<prompt>", "Complete replacement prompt")
    .action(async (prompt: string) => {
      const client = createCoreClient(createAppContext().config);
      const result = await client.updateGlobalSystemPrompt(prompt);
      console.log(green("Global system prompt updated."));
      console.log(dim(result.prompt));
    });

  settings.command("reset-bootstrap")
    .description("Delete and recreate bootstrap-managed agents")
    .option("--keep-learnings", "Transfer learnings to recreated agents with the same slug")
    .action(async (options: { keepLearnings?: boolean }) => {
      const client = createCoreClient(createAppContext().config);
      const result = await client.resetBootstrap(options.keepLearnings === true);
      console.log(green(`Bootstrap recreated ${result.createdAgents.length} agents.`));
      if (result.inheritedLearnings > 0) console.log(dim(`Inherited ${result.inheritedLearnings} learnings.`));
    });

  settings.command("reset-all")
    .description("Delete all Kampaku data and apply the project bootstrap again")
    .action(async () => {
      const client = createCoreClient(createAppContext().config);
      const result = await client.resetAll();
      console.log(green(`All data reset. Bootstrap created ${result.createdAgents.length} agents.`));
    });

  const folders = settings
    .command("folders")
    .description("Manage allowed filesystem folders");

  folders
    .command("list")
    .description("List allowed folders")
    .action(async () => {
      const client = createCoreClient(createAppContext().config);
      try {
        const { folders: items } = await client.getFilesystemSettings();
        if (!items.length) {
          console.log("No allowed folders configured.");
          return;
        }
        for (const folder of items) {
          const flags = folder.readOnly ? dim(" (read-only)") : green(" (read-write)");
          const label = folder.label ? ` ${dim(`[${folder.label}]`)}` : "";
          console.log(`${folder.path}${label}${flags}`);
          console.log(dim(`  id: ${folder.id}`));
        }
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  folders
    .command("add")
    .description("Add an allowed folder")
    .argument("<path>", "Absolute or relative folder path")
    .option("--read-only", "Allow reads only")
    .option("--label <label>", "Optional label")
    .action(async (path: string, options: { readOnly?: boolean; label?: string }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const settings = await client.addAllowedFolder({
          path,
          readOnly: options.readOnly ?? false,
          label: options.label,
        });
        const added = settings.folders[settings.folders.length - 1];
        console.log(green(`Added ${added.path}`));
        console.log(dim(`id: ${added.id}`));
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  folders
    .command("remove")
    .description("Remove an allowed folder by id or path")
    .argument("<id-or-path>", "Folder id or absolute path")
    .action(async (idOrPath: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const settings = await client.removeAllowedFolder(idOrPath);
        console.log(green(`Removed folder. ${settings.folders.length} remaining.`));
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });
}
