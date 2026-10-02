import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";
import { KAMPAKU_AGENT_ID } from "../../definitions.js";
import type { ProjectRecord } from "../../../persistence/store.js";
import {
  createProject,
  getProjectByIdOrSlug,
  updateProject,
} from "../../../application/projects.js";
import type { RepoBootstrapResult } from "../../../application/pm/repo-bootstrap.js";

export interface CreateProjectArgs {
  name: string;
  slug?: string;
  description?: string;
  project_lead_slug?: string;
  repositories?: Array<{ url: string; role?: string; defaultBranch?: string }>;
  /**
   * Opt in to linking a repository that lives inside the Kampaku workspace. Off by default: a
   * project for the emperor is a stranger project, and linking it into the platform monorepo is
   * how the platform ends up owning the app's source (see the isolation rule in the eval protocol).
   */
  allow_workspace_repository?: boolean;
  /**
   * The language or stack the emperor named, when they named one.
   *
   * Pass it through, do not guess it: when the emperor says "the same project, but in Python", the
   * seed writes that language's own check. When nobody named a stack, leave this out and the seed
   * writes the neutral check it can actually run. An empty directory declares no language, so this
   * argument is the only way the seed can know — and a stack it has no profile for falls back to the
   * neutral check and says so rather than writing a command the checkout cannot run.
   */
  stack?: string;
}

export interface CreateProjectResult {
  id: string;
  slug: string;
  name: string;
  status: string;
  projectLeadSlug: string | null;
  repositories: ProjectRecord["repositories"];
  /**
   * What was actually written to the checkout, when this call seeded one.
   *
   * Reported, not assumed: the suite-06 oracle asks a seed to *state* its own output — files, manifest
   * presence or absence, and whether version control was initialized — because a seed that reports nothing
   * about what it wrote cannot be verified against disk. It is also the only way the reply can be honest
   * about a checkout it left completely alone.
   */
  repoBootstrap?: RepoBootstrapResult;
}

export function executeCreateProject(
  ctx: KampakuToolContext,
  args: CreateProjectArgs,
  scope?: ToolRuntimeScope,
): CreateProjectResult {
  if (scope && scope.agentId !== KAMPAKU_AGENT_ID) {
    throw new Error("Only the root agent may create a project.");
  }

  const name = args.name?.trim();
  if (!name) throw new Error("Project name is required.");

  const slug = args.slug?.trim().toLowerCase() || undefined;
  if (slug && getProjectByIdOrSlug(ctx.store, slug)) {
    throw new Error(`Project "${slug}" already exists.`);
  }

  // The lead is required, and it is validated **before** anything is persisted.
  //
  // Two structural defects met here. First, a container with no owner is not an open work order —
  // nobody can approve a plan, own scope, or answer a question about it — yet the front office could
  // create one and report success. Measured in baseline run 2: `intake-demo`, `lead=none`, described as
  // "created successfully" (BOARD F-005). Second, the lead slug was validated *after* `createProject`,
  // so a typo left a persisted container behind and then threw: an orphan created by the failure path.
  //
  // Both are refusals in code rather than instructions in a prompt, because this is not a judgement
  // call. Naming the project, choosing the lead's skills, and slicing the work are judgement; a work
  // order having an owner is not.
  const leadSlug = args.project_lead_slug?.trim();
  if (!leadSlug) {
    throw new Error(
      "A work order needs an accountable owner: pass project_lead_slug. " +
        "Create the lead with create_sub_agent first, then open the container with that slug. " +
        "Nothing can link a lead to a container afterwards, so a container created without one stays unowned.",
    );
  }
  if (!ctx.agentStore.getAgentBySlugOrId(leadSlug)) {
    throw new Error(
      `Project lead agent "${leadSlug}" not found, so no container was created. ` +
        "Create the lead with create_sub_agent first, then retry with its exact slug.",
    );
  }

  // Repository validation lives in the application layer so every entry point shares it; this tool
  // only forwards the explicit opt-in.
  const project = createProject(
    ctx.store,
    {
      name,
      slug,
      description: args.description?.trim(),
      repositories: args.repositories,
      stack: args.stack?.trim() || undefined,
    },
    {
      allowWorkspaceRepository: args.allow_workspace_repository === true,
      workspaceRoot: ctx.config?.workspaceRoot,
      // A path that does not exist is still refused: this call links a checkout, it never invents one at a
      // path the emperor did not name. Seeding an **existing empty** directory is application-layer
      // behaviour shared by every entry point, not an escape hatch granted here.
      allowMissingPath: false,
    },
  );

  // The container exists and the lead exists, so linking cannot fail. If it ever does, the container
  // would be unowned and the caller has to know rather than receive a success.
  const linked = updateProject(ctx.store, ctx.agentStore, project.slug, {
    project_lead_slug: leadSlug,
  });
  if (!linked.projectLeadAgentId) {
    throw new Error(
      `Project "${linked.slug}" was created but linking lead "${leadSlug}" did not take effect. ` +
        "It has no accountable owner and must not be treated as an open work order.",
    );
  }

  return {
    id: linked.id,
    slug: linked.slug,
    name: linked.name,
    status: linked.status,
    projectLeadSlug: leadSlug,
    repositories: linked.repositories,
    // The seeding happened in `createProject`; the lead link is a second, narrower update that does not
    // touch repositories, so it cannot carry the result. Read it from the container, not from the second
    // call, or the seed's own report is silently dropped on the floor.
    repoBootstrap: project.repoBootstrap,
  };
}

export const CREATE_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_project",
    description:
      "Open a work order: create the top-level project that a body of work lives in, with its repository and its accountable lead. " +
      "A project is the container a work order lives in — not a Docker container or any other runtime object. " +
      "Required before a stranger repository can be linked, work items can be scoped, or execution can start. " +
      "When a file:// repository points at a directory that already exists and is **empty**, this call also " +
      "stands the checkout up: it runs version control, writes the project hygiene files, and writes the " +
      "minimal check that checkout can actually run — the stack's own check when the emperor named a stack, " +
      "or a neutral one that asserts the seeded files — returning `repoBootstrap` naming every file it wrote, " +
      "whether it initialized the repository, which profile it used, and the exact checks now declared. " +
      "Report those checks from `repoBootstrap.checks`; do not describe a command's output. A directory that " +
      "already contains anything is a stranger's checkout: it is linked exactly as it is and nothing is " +
      "written to it. " +
      "Requires project_lead_slug, so create the lead first. Only the root agent may call this.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable project name.",
        },
        slug: {
          type: "string",
          description:
            "Stable lowercase identifier. Defaults to a slug derived from the name.",
        },
        description: {
          type: "string",
          description: "One-sentence purpose of the project.",
        },
        project_lead_slug: {
          type: "string",
          description:
            "Required. Slug of the agent who leads this project, which must already exist. Create it with " +
            "create_sub_agent before calling this tool. A container with no accountable owner is not an " +
            "open work order, and no tool links a lead afterwards.",
        },
        stack: {
          type: "string",
          description:
            "The language or stack the emperor named for this project, such as python, when they named one. Pass it exactly as they said it; omit it when they did not. Only used when this call stands a new checkout up, where it decides which check the seed writes: a named stack gets that language's own minimal check, and no name gets the neutral check that runs without a toolchain.",
        },
        allow_workspace_repository: {
          type: "boolean",
          description:
            "Set true only if the emperor explicitly asked for the repository to live inside the Kampaku workspace. Otherwise a file:// repository inside the workspace is refused.",
        },
        repositories: {
          type: "array",
          description:
            "Repositories this project owns. A file:// URL must point at a directory that already exists on disk; the project will not claim a repository it does not have.",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "Repository URL (file:// or https://)." },
              role: {
                type: "string",
                description: "Repository role such as web, core, worker, contracts, or docs.",
              },
              defaultBranch: { type: "string", description: "Default branch. Defaults to main." },
            },
            required: ["url"],
          },
        },
      },
      required: ["name", "project_lead_slug"],
    },
  },
};
