import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";
import { KAMPAKU_AGENT_ID } from "../../definitions.js";
import type { ProjectRecord } from "../../../persistence/store.js";
import {
  createProject,
  getProjectByIdOrSlug,
  updateProject,
} from "../../../application/projects.js";

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
}

export interface CreateProjectResult {
  id: string;
  slug: string;
  name: string;
  status: string;
  projectLeadSlug: string | null;
  repositories: ProjectRecord["repositories"];
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
    },
    {
      allowWorkspaceRepository: args.allow_workspace_repository === true,
      workspaceRoot: ctx.config?.workspaceRoot,
      // This tool does not seed a checkout, so a path that does not exist would be a link to nothing.
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
      "Creates the container and its links only; seeding files is separate work delegated to the project team. " +
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
