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

  if (args.project_lead_slug?.trim()) {
    const leadSlug = args.project_lead_slug.trim();
    if (!ctx.agentStore.getAgentBySlugOrId(leadSlug)) {
      throw new Error(`Project lead agent "${leadSlug}" not found.`);
    }
    const linked = updateProject(ctx.store, ctx.agentStore, project.slug, {
      project_lead_slug: leadSlug,
    });
    return {
      id: linked.id,
      slug: linked.slug,
      name: linked.name,
      status: linked.status,
      projectLeadSlug: leadSlug,
      repositories: linked.repositories,
    };
  }

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    status: project.status,
    projectLeadSlug: null,
    repositories: project.repositories,
  };
}

export const CREATE_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_project",
    description:
      "Create the top-level project that a body of work lives in. Required before a stranger repository can be linked, work items can be scoped, or execution can start. Creates the project only — seeding files in the repository is separate work delegated to the project team. Only the root agent may call this.",
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
            "Slug of the agent who leads this project. Creates the project unlinked when omitted.",
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
      required: ["name"],
    },
  },
};
