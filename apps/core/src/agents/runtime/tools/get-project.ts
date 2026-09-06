import type { KampakuToolContext } from "./index.js";
import { getProjectOverview } from "../../../application/pm/dashboard.js";

export interface GetProjectArgs {
  project_slug_or_id: string;
}

export function executeGetProject(ctx: KampakuToolContext, args: GetProjectArgs): {
  project: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    status: string;
    projectLeadAgentId?: string | null;
    projectLeadSlug?: string | null;
  };
  documents: Array<{ slug: string; title: string }>;
  milestones: Array<{
    title: string;
    status: string;
    description?: string;
    executedBy: string;
    successCriteria: string[];
  }>;
  workItems: Array<{
    id: string;
    title: string;
    status: string;
    assigneeSlug?: string;
    routingReason?: string;
    acceptanceCriteria: string[];
    dependsOn: string[];
    children: unknown[];
  }>;
} {
  const overview = getProjectOverview(ctx.store, ctx.pmStore, args.project_slug_or_id);
  if (!overview) {
    throw new Error(
    `Project "${args.project_slug_or_id}" not found. Available projects: ${
      ctx.store.listProjects().map((project) => project.slug).join(", ") || "(none)"
    }. Call list_projects for a full inventory.`,
  );
  }

  const slugById = new Map(
    ctx.agentStore.listAllAgents().map((a) => [a.id, a.slug]),
  );

  type MappedWorkItem = {
    id: string;
    title: string;
    status: string;
    assigneeSlug?: string;
    routingReason?: string;
    acceptanceCriteria: string[];
    dependsOn: string[];
    children: MappedWorkItem[];
  };

  const mapWorkItems = (nodes: typeof overview.workItems): MappedWorkItem[] =>
    nodes.map((node) => ({
      id: node.item.id,
      title: node.item.title,
      status: node.item.status,
      assigneeSlug: node.item.assigneeAgentId
        ? slugById.get(node.item.assigneeAgentId)
        : undefined,
      routingReason: node.item.routingReason,
      acceptanceCriteria: node.item.acceptanceCriteria,
      dependsOn: node.item.dependsOn,
      children: mapWorkItems(node.children),
    }));

  return {
    project: {
      id: overview.project.id,
      slug: overview.project.slug,
      name: overview.project.name,
      description: overview.project.description,
      status: overview.project.status,
      projectLeadAgentId: overview.project.projectLeadAgentId ?? null,
      projectLeadSlug: overview.project.projectLeadAgentId
        ? slugById.get(overview.project.projectLeadAgentId) ?? null
        : null,
    },
    documents: overview.documents.map((d) => ({
      slug: d.slug,
      title: d.title,
    })),
    milestones: overview.milestones.map((m) => ({
      title: m.title,
      status: m.status,
      description: m.description,
      executedBy: m.executedBy,
      successCriteria: m.successCriteria,
    })),
    workItems: mapWorkItems(overview.workItems),
  };
}

export const GET_PROJECT_TOOL = {
  type: "function" as const,
  function: {
    name: "get_project",
    description:
      "Get full project overview: documents, roadmap milestones, and recursive work items with assignees. " +
      "Call before submit_intent on an existing project to inspect open tasks (not done/cancelled) and decide whether to refine scope, add subtasks, or open a new track.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Project slug or UUID.",
        },
      },
      required: ["project_slug_or_id"],
    },
  },
};
