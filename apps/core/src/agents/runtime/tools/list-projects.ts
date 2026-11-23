import type { KampakuToolContext } from "./index.js";

/**
 * The projects that exist, as one read.
 *
 * Suite 17 asks for this by name — *"Inventory answers match `list_projects` output exactly"* — and the product
 * had no tool with that name: asked "what projects exist right now?", the front office could reach the
 * durable-state block, `get_project` for one slug it had to guess, or `GET /api/v1/projects`. The block is a
 * projection that deliberately compresses (`docs/eval/archive/baseline-2026-09-24.md`), so an inventory answer reconciled
 * against a tool result had no tool to reconcile against, and the suite's oracle could not be measured at all.
 *
 * This is additive and read-only: it returns the fields every other surface already publishes — id, slug, name,
 * status, the lead as a **slug** (`get_project`'s rule: an operator cannot confirm an agent uuid), and
 * repositories as **urls** rather than a count (BOARD F-034). Nothing here writes, and nothing here can be read
 * as a claim about a project that is not in the store.
 */
export interface ListProjectsArgs {
  /** Optional substring filter on slug and name. Omitted means every project. */
  match?: string;
}

export function executeListProjects(ctx: KampakuToolContext, args: ListProjectsArgs = {}) {
  const match = args.match?.trim().toLowerCase();
  const slugById = new Map(ctx.agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));
  const projects = ctx.store
    .listProjects()
    .filter((project) =>
      match
        ? project.slug.toLowerCase().includes(match) || project.name.toLowerCase().includes(match)
        : true,
    )
    // One stated order — by slug — so two reads of the same instance compare equal, and a reply that lists them
    // in the tool's order can be diffed against it byte for byte (suite 17's § How to measure).
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      status: project.status,
      projectLeadSlug: project.projectLeadAgentId
        ? slugById.get(project.projectLeadAgentId) ?? null
        : null,
      repositories: project.repositories.map((repo) => ({ url: repo.url, role: repo.role })),
    }));

  return {
    total: projects.length,
    projects,
    /**
     * The slugs a caller may pass to any project-scoped tool, stated here so a miss elsewhere can list them
     * without a second read. Suite 17's second prompt asks about a slug that does not exist, and the honest
     * answer lists the ones that do.
     */
    availableSlugs: projects.map((project) => project.slug),
  };
}

export const LIST_PROJECTS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_projects",
    description:
      "List every project (work-order container) that exists, with its id, slug, name, status, lead slug and " +
      "repository urls, plus `availableSlugs`. This is the inventory: call it before answering any question " +
      "about which projects exist, and never answer such a question from memory or from an earlier reply.",
    parameters: {
      type: "object",
      properties: {
        match: {
          type: "string",
          description: "Optional substring to filter slugs and names by. Omit to list every project.",
        },
      },
      additionalProperties: false,
    },
  },
};
