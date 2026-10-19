import { createProjectSkill } from "../../../application/skills.js";
import type { AgentStore } from "../../../persistence/agent-store.js";
import { SkillStoreError, type SkillStore } from "../../../persistence/skill-store.js";
import type { Store } from "../../../persistence/store.js";

export interface CreateSkillArgs {
  /** The project this capability is for. Required: a skill for every project is a seed skill. */
  project_slug: string;
  slug: string;
  name: string;
  description: string;
  capabilities?: string[];
  tools?: string[];
  prompt_fragment: string;
}

export interface CreateSkillResult {
  skill: {
    slug: string;
    name: string;
    description: string;
    project_slug: string;
    scope: "project";
  };
  /** The tools the station that holds this skill will hold, in the names the runtime answers to. */
  tools: string[];
  /** What to do next, so the caller does not have to guess whether authoring assigned anything. */
  next: string;
}

/**
 * Tool names a prompt fragment connects to an action its reader takes.
 *
 * The same anchor `orchestrator-skill-scope.test.ts` guards the resident catalog with: `Use`, `Call`,
 * and the connectives the catalog actually writes (`via`, `using`, `through`, `with`, `then`). It is
 * deliberately generous — a match that is not a tool name is harmless, because only names the runtime
 * registers are judged.
 */
function instructedToolNames(fragment: string): string[] {
  const found = new Set<string>();
  for (const match of fragment.matchAll(
    /\b(?:Use|Call|via|using|through|with|then)\s+([a-z][a-z0-9_]{3,})\b/gi,
  )) {
    found.add(match[1]!.toLowerCase());
  }
  return [...found];
}

/**
 * Authors a capability for **one project**, through the runtime (BOARD F-022).
 *
 * The defect this closes was measured on suite 03's run `s03r3`: a Terraform module was staffed with a
 * station for its nested network module that held **thirteen skills, every one of them a default**, and
 * the staffing turn said so in its own reply — *"the skill catalog holds no Terraform or AWS skill"*.
 * The honest sentence was the problem: there was no operation that could have made the sentence false,
 * and no field in a skill that could have said *this belongs to that project*.
 *
 * Three decisions are worth stating, because each one keeps this from becoming a second way to widen
 * the catalog by accident:
 *
 * - **The act has an owner.** A project's linked lead may author for its own project — the same
 *   authority ADR-0006 gives it to create that project's seats — and so may the front office that
 *   staffs those seats, and any agent holding `system-skill-admin`. A seat that leads nothing does not
 *   hold the tool at all; the refusal is assembled in `toolsForAgent` before this handler is reached.
 * - **The grant is admitted against the runtime, not against the author.** Every declared tool must be
 *   a name the runtime registers, and every tool the fragment connects to an action must be one the
 *   skill itself declares. That is why this tool cannot smuggle in a `code-agent` (nine seed fragments
 *   declare one the runtime registers nowhere — BOARD F-031) and why the station that holds the skill
 *   holds every tool its instructions tell it to call.
 * - **Nothing is written into the platform's repository.** Authoring is a row in this instance's
 *   catalog. A `SKILL.md` under `packages/contracts/skills` would be a shell into the platform repo and
 *   would be re-seeded into every project on the next boot, which is the opposite of scoping.
 */
export function executeCreateSkill(
  ctx: { store: Store; agentStore: AgentStore; skillStore: SkillStore },
  args: CreateSkillArgs,
  scope: { agentId: string } | undefined,
  registeredTools: ReadonlySet<string>,
): CreateSkillResult {
  const actor = scope ? ctx.agentStore.getAgentBySlugOrId(scope.agentId) : undefined;
  if (!actor) {
    throw new Error(
      "Authoring a skill needs to know who is authoring it. This call came without an agent scope.",
    );
  }

  const projectRef = args.project_slug?.trim();
  if (!projectRef) {
    throw new Error(
      "A skill authored through this tool is scoped to a project, so `project_slug` is required. A " +
        "capability every project may hold is a seed skill, and those live in the platform's catalog.",
    );
  }

  const project = ctx.store.getProjectByIdOrSlug(projectRef);
  if (!project) {
    throw new Error(
      `Project "${projectRef}" not found, so no skill was authored. Name an existing project with ` +
        "`project_slug`.",
    );
  }

  const heldSkills = ctx.skillStore.listAgentSkills(actor.id);
  const holdsSkillAdmin = heldSkills.includes("system-skill-admin");
  const leadsThisProject = project.projectLeadAgentId === actor.id;
  const isFrontOffice = actor.slug === "kampaku";
  if (!holdsSkillAdmin && !leadsThisProject && !isFrontOffice) {
    throw new Error(
      `Agent "${actor.slug}" does not lead project "${project.slug}", so it cannot author a skill for ` +
        "it. A project's linked lead, the front office that staffs it, and an agent holding " +
        "system-skill-admin may author a project-scoped skill. Name a project you lead, or report that " +
        "the capability belongs to that project's own lead.",
    );
  }

  const declaredTools = args.tools ?? [];
  const unregistered = declaredTools.filter((tool) => !registeredTools.has(tool));
  if (unregistered.length > 0) {
    throw new Error(
      `The skill declares ${unregistered.map((tool) => `"${tool}"`).join(", ")}, which the runtime ` +
        "registers nowhere, so a station holding this skill would be told it can reach a tool that " +
        `does not exist. Declared tools must be runtime tools: ${[...registeredTools].length} are ` +
        "registered. Drop them, or describe the work in the instructions without a tool name.",
    );
  }

  const fragmentTools = instructedToolNames(args.prompt_fragment ?? "").filter((tool) =>
    registeredTools.has(tool),
  );
  const undeclared = fragmentTools.filter((tool) => !declaredTools.includes(tool));
  if (undeclared.length > 0) {
    throw new Error(
      `The instructions name ${undeclared.map((tool) => `"${tool}"`).join(", ")}, which this skill ` +
        "does not declare, so the station that holds it would be instructed to call a tool it does not " +
        "hold. Declare them in `tools`, or reword the instruction so it describes the work rather than " +
        "the tool.",
    );
  }

  try {
    const skill = createProjectSkill(ctx.skillStore, ctx.agentStore, ctx.store, projectRef, {
      slug: args.slug,
      name: args.name,
      description: args.description,
      capabilities: args.capabilities ?? [],
      tools: declaredTools,
      promptFragment: args.prompt_fragment,
    });
    return {
      skill: {
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        project_slug: project.slug,
        scope: "project",
      },
      tools: skill.tools,
      next:
        `Nothing holds this skill yet. Give it to the station whose aspect needs it: ` +
        `create_sub_agent with skill_slugs: ["${skill.slug}"], or assign_skill on a seat that already ` +
        `exists. Only project "${project.slug}" may be given it.`,
    };
  } catch (error) {
    if (error instanceof SkillStoreError) throw new Error(error.message);
    throw error;
  }
}

export const CREATE_SKILL_TOOL = {
  type: "function" as const,
  function: {
    name: "create_skill",
    description:
      "Author a skill for ONE project, when no seed skill covers an aspect the project actually has " +
      "(an IaC module, a data pipeline, a schema). Scoped to that project: no other project may be " +
      "given it, it is never assigned by default, and it is a runtime record rather than a file in the " +
      "platform's catalog. Every tool in `tools` must be one the runtime registers, and every tool the " +
      "instructions name must be declared in `tools`. Nothing is assigned by authoring it — pass its " +
      "slug to create_sub_agent or assign_skill.",
    parameters: {
      type: "object",
      properties: {
        project_slug: {
          type: "string",
          description: "The project this capability belongs to. Required: skills here are project-scoped.",
        },
        slug: {
          type: "string",
          description:
            "Catalog-wide identifier: lowercase letters, numbers, and single hyphens. Unique across the " +
            "whole catalog, so prefix it with the aspect rather than the project.",
        },
        name: { type: "string", description: "Display name for the station that holds it." },
        description: {
          type: "string",
          description: "What capability this grants, in one or two sentences.",
        },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "Capability tags, e.g. [\"iac.terraform\", \"network.vpc\"].",
        },
        tools: {
          type: "array",
          items: { type: "string" },
          description:
            "Runtime tool names the station holding this skill will hold. Must be registered tools, " +
            "and must cover every tool the instructions tell the reader to call.",
        },
        prompt_fragment: {
          type: "string",
          description:
            "Markdown instructions for the holder. Name only tools declared in `tools`; describe " +
            "everything else as work.",
        },
      },
      required: ["project_slug", "slug", "name", "description", "prompt_fragment"],
    },
  },
};
