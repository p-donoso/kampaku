import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { printSkillDetails, printSkillsList, runSkillsCommand } from "../skills-output.js";
import { red } from "../ansi.js";
import { CoreClientError } from "../../client/core-client.js";

interface DeleteOptions {
  yes?: boolean;
}

export function registerSkillsCommand(program: Command) {
  const skills = program
    .command("skills")
    .description("Inspect and manage Kampaku skills");

  skills
    .command("list")
    .description("List all skills")
    .action(async () => {
      const client = createCoreClient(createAppContext().config);
      const { skills: items } = await client.listSkills();
      printSkillsList(items);
    });

  skills
    .command("show")
    .description("Show skill details")
    .argument("<slug>", "Skill slug")
    .action(async (slug: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const skill = await client.getSkill(slug);
        printSkillDetails(skill);
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  skills
    .command("create")
    .description("Create a new skill")
    .requiredOption("--slug <slug>", "Skill slug")
    .requiredOption("--name <name>", "Display name")
    .requiredOption("--description <text>", "Description including when to use the skill")
    .option("--capabilities <list>", "Comma-separated capabilities")
    .option("--tools <list>", "Comma-separated tools")
    .requiredOption("--instructions <markdown>", "Markdown instructions")
    .action(async (options: {
      slug: string;
      name: string;
      description: string;
      capabilities?: string;
      tools?: string;
      instructions: string;
    }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const skill = await client.createSkill({
          slug: options.slug,
          name: options.name,
          description: options.description,
          capabilities: options.capabilities?.split(",").map((s) => s.trim()).filter(Boolean),
          tools: options.tools?.split(",").map((s) => s.trim()).filter(Boolean),
          prompt_fragment: options.instructions,
        });
        console.log(`Created skill "${skill.slug}".`);
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  skills
    .command("update")
    .description("Update an existing skill")
    .argument("<slug>", "Skill slug")
    .option("--slug <new-slug>", "New slug")
    .option("--name <name>", "Display name")
    .option("--description <text>", "Description")
    .option("--capabilities <list>", "Comma-separated capabilities")
    .option("--tools <list>", "Comma-separated tools")
    .option("--instructions <markdown>", "Markdown instructions")
    .action(async (
      slug: string,
      options: {
        slug?: string;
        name?: string;
        description?: string;
        capabilities?: string;
        tools?: string;
        instructions?: string;
      },
    ) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const skill = await client.updateSkill(slug, {
          slug: options.slug,
          name: options.name,
          description: options.description,
          capabilities: options.capabilities?.split(",").map((s) => s.trim()).filter(Boolean),
          tools: options.tools?.split(",").map((s) => s.trim()).filter(Boolean),
          prompt_fragment: options.instructions,
        });
        console.log(`Updated skill "${skill.slug}".`);
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });

  skills
    .command("delete")
    .description("Delete a skill")
    .argument("<slug>", "Skill slug")
    .option("-y, --yes", "Skip confirmation")
    .action(async (slug: string, options: DeleteOptions) => {
      const client = createCoreClient(createAppContext().config);

      if (!options.yes) {
        console.log(`Use --yes to delete skill "${slug}".`);
        return;
      }

      try {
        await client.deleteSkill(slug);
        console.log(`Deleted skill "${slug}".`);
      } catch (error) {
        if (error instanceof CoreClientError) {
          console.error(red(error.message));
          process.exit(1);
        }
        throw error;
      }
    });
}
