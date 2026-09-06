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
  wiki_sync_required?: boolean;
  wiki_sync_page_slug?: string;
  wiki_sync_phase_pages?: Record<string, string>;
}

export function executeUpdateProject(
  ctx: KampakuToolContext,
  args: UpdateProjectArgs,
): {
  id: string;
  slug: string;
  name: string;
  description: string | null;
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
    wikiSyncRequired: args.wiki_sync_required,
    wikiSyncPageSlug: args.wiki_sync_page_slug,
    wikiSyncPhasePages: args.wiki_sync_phase_pages,
  });

  const projectLeadSlug = project.projectLeadAgentId
    ? ctx.agentStore.getAgentBySlugOrId(project.projectLeadAgentId)?.slug ?? null
    : null;

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? null,
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
      "Update project metadata. Kampaku may set name and description only. Project leads may also change status, lead, repositories, and wiki sync fields.",
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
        wiki_sync_required: { type: "boolean", description: "Require a published wiki synchronization before sensitive task closure." },
        wiki_sync_page_slug: { type: "string", description: "Specific wiki page slug that must be published and synchronized when wiki sync is required." },
        wiki_sync_phase_pages: { type: "object", additionalProperties: { type: "string" }, description: "Map phase keys such as phase-1 to the wiki page slug required for that phase." },
      },
      required: ["project_slug_or_id"],
    },
  },
};
