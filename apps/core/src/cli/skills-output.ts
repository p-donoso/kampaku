import { CoreClient, CoreClientError } from "../client/core-client.js";
import { cyan, dim, red } from "./ansi.js";

type SkillRecord = {
  slug: string;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  promptFragment: string;
  assignedAgentSlugs?: string[];
  /** The project this capability was authored for, or null/absent for a seed skill (BOARD F-022). */
  projectSlug?: string | null;
};

export function printSkillDetails(skill: SkillRecord): void {
  console.log(`Slug:             ${skill.slug}`);
  console.log(`Name:             ${skill.name}`);
  console.log(`Description:      ${skill.description}`);
  console.log(`Capabilities:     ${skill.capabilities.join(", ") || "(none)"}`);
  console.log(`Tools:            ${skill.tools.join(", ") || "(none)"}`);
  // Which project a capability belongs to, on the surface an operator reads. A project-scoped skill is
  // one project's alone; a seed skill may be given to any. `skills list` printing 37 with no difference
  // between the two would leave the operator unable to tell which of them they may assign (BOARD F-022).
  console.log(
    `Scope:            ${skill.projectSlug ? `project ${skill.projectSlug}` : "seed catalog (any project)"}`,
  );
  if (skill.assignedAgentSlugs?.length) {
    console.log(`Assigned agents:  ${skill.assignedAgentSlugs.join(", ")}`);
  }
  console.log("");
  console.log("Instructions (Markdown):");
  console.log(skill.promptFragment);
}

export function printSkillsList(skills: SkillRecord[]): void {
  if (!skills.length) {
    console.log("No skills found.");
    return;
  }
  console.log("");
  for (const skill of skills) {
    const agents = skill.assignedAgentSlugs?.length
      ? ` [${skill.assignedAgentSlugs.join(", ")}]`
      : "";
    const scope = skill.projectSlug ? dim(` (project ${skill.projectSlug})`) : "";
    console.log(`  ${cyan(skill.slug)} — ${skill.name}${scope}${agents}`);
    if (skill.description) {
      console.log(dim(`    ${skill.description}`));
    }
  }
  console.log("");
}

function parseListArg(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseSkillFlags(args: string[]): {
  slug?: string;
  name?: string;
  description?: string;
  capabilities?: string[];
  tools?: string[];
  prompt_fragment?: string;
  project?: string;
} {
  const input: {
    slug?: string;
    name?: string;
    description?: string;
    capabilities?: string[];
    tools?: string[];
    prompt_fragment?: string;
    project?: string;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) break;
    if (flag === "--slug") input.slug = value;
    if (flag === "--name") input.name = value;
    if (flag === "--description") input.description = value;
    if (flag === "--capabilities") input.capabilities = parseListArg(value);
    if (flag === "--tools") input.tools = parseListArg(value);
    if (flag === "--instructions" || flag === "--prompt-fragment") input.prompt_fragment = value;
    if (flag === "--project") input.project = value;
    index += 1;
  }

  return input;
}

export async function runSkillsCommand(client: CoreClient, args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase() ?? "list";

  if (sub === "list") {
    const { skills } = await client.listSkills();
    printSkillsList(skills);
    return;
  }

  if (sub === "show") {
    const slug = args[1];
    if (!slug) {
      console.log(dim("Usage: /skills show <slug>"));
      return;
    }
    try {
      const skill = await client.getSkill(slug);
      printSkillDetails(skill);
    } catch (error) {
      if (error instanceof CoreClientError) {
        console.error(red(error.message));
        return;
      }
      throw error;
    }
    return;
  }

  if (sub === "create") {
    const input = parseSkillFlags(args.slice(1));
    if (!input.slug || !input.name || !input.description || !input.prompt_fragment) {
      console.log(
        dim(
          "Usage: /skills create --slug <slug> --name <name> --description <text> --instructions <markdown> [--capabilities a,b] [--tools a,b] [--project <slug>]",
        ),
      );
      return;
    }
    try {
      const skill = await client.createSkill({
        slug: input.slug,
        name: input.name,
        description: input.description,
        capabilities: input.capabilities,
        tools: input.tools,
        prompt_fragment: input.prompt_fragment,
        // With a project named, this authors the capability for that project alone (BOARD F-022): it is
        // recorded against the project, no catalog file is written, and no other project may be given it.
        ...(input.project ? { project: input.project } : {}),
      });
      console.log(
        `Created skill "${skill.slug}"${input.project ? ` for project ${input.project}` : ""}.`,
      );
    } catch (error) {
      if (error instanceof CoreClientError) {
        console.error(red(error.message));
        return;
      }
      throw error;
    }
    return;
  }

  if (sub === "update") {
    const slug = args[1];
    if (!slug) {
      console.log(
        dim(
          "Usage: /skills update <slug> [--name ...] [--description ...] [--capabilities a,b] [--tools a,b] [--instructions ...]",
        ),
      );
      return;
    }
    const input = parseSkillFlags(args.slice(2));
    if (
      !input.name &&
      !input.description &&
      !input.capabilities &&
      !input.tools &&
      !input.prompt_fragment &&
      !input.slug
    ) {
      console.log(dim("Provide at least one field to update."));
      return;
    }
    try {
      const skill = await client.updateSkill(slug, input);
      console.log(`Updated skill "${skill.slug}".`);
    } catch (error) {
      if (error instanceof CoreClientError) {
        console.error(red(error.message));
        return;
      }
      throw error;
    }
    return;
  }

  if (sub === "delete") {
    const slug = args[1];
    if (!slug) {
      console.log(dim("Usage: /skills delete <slug> [-y]"));
      return;
    }
    const confirmed = args.includes("-y") || args.includes("--yes");
    if (!confirmed) {
      console.log(dim(`Use -y to delete skill "${slug}".`));
      return;
    }
    try {
      await client.deleteSkill(slug);
      console.log(`Deleted skill "${slug}".`);
    } catch (error) {
      if (error instanceof CoreClientError) {
        console.error(red(error.message));
        return;
      }
      throw error;
    }
    return;
  }

  console.log(dim(`Unknown skills subcommand: ${sub}. Use list, show, create, update, or delete.`));
}
