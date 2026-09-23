import type { KampakuToolContext } from "./index.js";
import { getProjectByIdOrSlug, updateProject } from "../../../application/projects.js";
import type { ProjectStatus } from "../../../persistence/store.js";
import { buildPostActionRuntime, recordPostActionLifecycle } from "../../../application/pm/post-action/index.js";

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
  slug: string;
  name: string;
  status: string;
  projectLeadSlug: string | null;
  coherenceStrategy: string | null;
  repositories: Array<{ url: string; role?: string; defaultBranch?: string }>;
} {
  // A bare "Project not found" left the caller to invent a creation path: an agent asked to
  // create a project tried this tool, got the error, and explained to the emperor that projects
  // are "typically created by submit_intent with create_missing_agents: true" — a mechanism that
  // does not exist. The error now names the tool that does the job.
  if (!getProjectByIdOrSlug(ctx.store, args.project_slug_or_id)) {
    throw new Error(
      `Project "${args.project_slug_or_id}" not found. Creating agents or submitting an intent does not create a project: call create_project first.`,
    );
  }

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

  if (args.repositories && args.repositories.length > 0) {
    recordPostActionLifecycle(
      buildPostActionRuntime({
        pmStore: ctx.pmStore,
        agentStore: ctx.agentStore,
        reviewStore: ctx.postActionStore,
        store: ctx.store,
        journalStore: ctx.journalStore,
        memoryStore: ctx.memoryStore,
        wikiStore: ctx.wikiStore,
      }),
      {
        event: "repo_changed",
        projectId: project.id,
        workItemId: undefined,
        referenceId: `${project.id}:repositories`,
        summary: `Repository links changed for ${project.slug}: ${args.repositories
          .map((repository) => repository.url)
          .join(", ")}`,
        decisions: ["Repository link updated by the project owner."],
        followUps: ["Check README, docs, wiki, tests, and contracts for drift after the repository change."],
        wikiSyncRequired: project.wikiSyncRequired === true,
      },
    );
  }

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
        wiki_sync_required: { type: "boolean", description: "Require a published wiki synchronization before sensitive task closure." },
        wiki_sync_page_slug: { type: "string", description: "Specific wiki page slug that must be published and synchronized when wiki sync is required." },
        wiki_sync_phase_pages: { type: "object", additionalProperties: { type: "string" }, description: "Map phase keys such as phase-1 to the wiki page slug required for that phase." },
      },
      required: ["project_slug_or_id"],
    },
  },
};
