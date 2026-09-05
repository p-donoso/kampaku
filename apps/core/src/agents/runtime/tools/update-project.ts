import type { KampakuToolContext } from "./index.js";
import { updateProject } from "../../../application/projects.js";
import type { ProjectStatus } from "../../../persistence/store.js";

export interface UpdateProjectArgs {
  project_slug_or_id: string;
  name?: string;
  description?: string;
  status?: ProjectStatus;
  project_lead_slug?: string | null;
  coherence_strategy?: string | null;
  repositories?: Array<{ url: string; role?: string; defaultBranch?: string }>;
}

export function executeUpdateProject(
  ctx: KampakuToolContext,
  args: UpdateProjectArgs,
): {
  slug: string;
  name: string;
  status: string;
  projectLeadSlug: string | null;
  coherenceStrategy: string | null;
  repositories: Array<{ url: string; role?: string; defaultBranch?: string }>;
} {
  const project = updateProject(ctx.store, ctx.agentStore, args.project_slug_or_id, {
    name: args.name,
    description: args.description,
    status: args.status,
    project_lead_slug: args.project_lead_slug,
    coherence_strategy: args.coherence_strategy,
    repositories: args.repositories,
  });

  const projectLeadSlug = project.projectLeadAgentId
    ? ctx.agentStore.getAgentBySlugOrId(project.projectLeadAgentId)?.slug ?? null
    : null;

  return {
    slug: project.slug,
    name: project.name,
    status: project.status,
    projectLeadSlug,
    coherenceStrategy: project.coherenceStrategy ?? null,
    repositories: project.repositories,
  };
}

export const UPDATE_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_project",
    description:
      "Update project metadata or assign a project lead agent. Use project_lead_slug to link an agent who owns cross-agent coherence for the project.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Project slug or UUID.",
        },
        name: {
          type: "string",
          description: "New display name.",
        },
        description: {
          type: "string",
          description: "New description.",
        },
        status: {
          type: "string",
          enum: ["planning", "active", "on_hold", "completed", "archived"],
          description: "New project status.",
        },
        project_lead_slug: {
          type: ["string", "null"],
          description: "Agent slug to set as project lead, or null to clear.",
        },
        coherence_strategy: {
          type: ["string", "null"],
          description: "How the project lead maintains coherence across agents.",
        },
        repositories: {
          type: "array",
          description: "Linked code repositories for worker checkout (file:// URLs with role).",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              role: { type: "string", enum: ["core", "worker", "contracts", "docs", "web"] },
              defaultBranch: { type: "string" },
            },
            required: ["url"],
          },
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};
