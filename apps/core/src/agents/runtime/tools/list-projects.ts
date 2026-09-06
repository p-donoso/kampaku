import type { KampakuToolContext } from "./index.js";

export function executeListProjects(ctx: KampakuToolContext) {
  const projects = ctx.store.listProjects().map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    status: project.status,
    description: project.description,
    projectLeadAgentId: project.projectLeadAgentId,
    projectLeadSlug: project.projectLeadAgentId
      ? ctx.agentStore.getAgentBySlugOrId(project.projectLeadAgentId)?.slug
      : undefined,
  }));

  return {
    projects,
    count: projects.length,
    defaultHint:
      projects.find((project) => project.slug === "kampaku")?.slug ?? projects[0]?.slug ?? null,
  };
}

export const LIST_PROJECTS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_projects",
    description:
      "List all projects with slug, name, status, and project lead. Call this first when the emperor asks what exists, whether the system is ready, or for an inventory of projects. Do not invent missing projects — if count is 0, say so explicitly.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};
