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
}

export interface CreateProjectResult {
  id: string;
  slug: string;
  name: string;
  status: string;
  projectLeadSlug: string | null;
  repositories: ProjectRecord["repositories"];
}

/**
 * Creates the top-level container a body of work lives in.
 *
 * The capability already existed in the application layer and was reachable from
 * `POST /api/v1/projects`, but no agent tool exposed it, so an agent asked to "create the
 * project" could only update projects that already existed. It answered by proposing a team
 * and asking permission instead of doing the work (LangProbe G-03), and the whole arc was
 * blocked: without a project there is no repository to link, no work items to scope, and
 * nothing to execute.
 *
 * Authorization: only the root agent may create a project. Projects are top-level
 * containers, and the root agent is the emperor's interface; a sub-agent provisioning new
 * top-level projects would widen its own reach beyond its delegation. Root-only is the
 * least-privilege choice here and mirrors the rule that only the root agent addresses the
 * emperor directly.
 */
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

  const project = createProject(ctx.store, {
    name,
    slug,
    description: args.description?.trim(),
    repositories: args.repositories?.map((repo) => ({
      url: repo.url,
      role: repo.role ?? "web",
      defaultBranch: repo.defaultBranch ?? "main",
    })),
  });

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
        repositories: {
          type: "array",
          description:
            "Repositories this project owns. Use a file:// URL for a repository that already exists on disk.",
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
