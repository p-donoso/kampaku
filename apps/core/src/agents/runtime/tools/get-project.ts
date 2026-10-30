import type { KampakuToolContext } from "./index.js";
import { getProjectOverview } from "../../../application/pm/dashboard.js";
import { maturityOf, publicationOf } from "../../../application/wiki/wiki.js";
import type { WikiPageMaturity, WikiPageStatus } from "../../../persistence/wiki-store.js";

export interface GetProjectArgs {
  project_slug_or_id: string;
}

export function executeGetProject(ctx: KampakuToolContext, args: GetProjectArgs): {
  /**
   * The container's identifying fields, in resolvable form.
   *
   * These three were **not** returned, and that omission was the root cause of suite 01's prompt 4:
   * asked to confirm the container's id, owner and repository path, the front office called this tool —
   * the only project-detail tool it holds, and the right instinct — and answered faithfully from what
   * came back. What came back could not contain the answer, so the reply was a true summary of an
   * incomplete read (BOARD F-030).
   *
   * The data was never missing: `ProjectOverview.project` is a full `ProjectRecord`, so the mapping below
   * was discarding `id`, `projectLeadAgentId` and `repositories` on the way out.
   *
   * "Resolvable form" is the part that matters and is deliberate: the owner is returned as a **slug**, not
   * an agent id, and repositories as **urls**, not a count. The durable-state block compresses to the
   * opposite (an agent id, a count) because an inventory wants breadth, and a projection that an operator
   * is meant to *read* has to name things a person can act on. See docs/eval/archive/baseline-2026-09-24.md § the
   * block is lossy in exactly the fields that were asked for.
   */
  project: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    status: string;
    projectLeadSlug: string | null;
    repositories: Array<{ url: string; role?: string }>;
  };
  documents: Array<{
    slug: string;
    title: string;
    /** `published`, `proposal`, `draft` or `archived` — one word, and the same on every surface. */
    publication: "published" | "proposal" | "draft" | "archived";
    /** `shipped` or `planned`: whether the software the page describes exists. */
    maturity: "shipped" | "planned";
  }>;
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
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
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
      // The owner as a slug, because an agent uuid cannot be confirmed by a person. `slugById` is already
      // built above for work-item assignees.
      projectLeadSlug: overview.project.projectLeadAgentId
        ? slugById.get(overview.project.projectLeadAgentId) ?? null
        : null,
      // Urls, not a count. A repository path is a fact about the checkout; "1" is not.
      repositories: overview.project.repositories.map((repo) => ({
        url: repo.url,
        role: repo.role,
      })),
    },
    // A document listed as `{slug, title}` cannot be told apart from a live page, and that is exactly what was
    // asked of this tool on suite 09's `s09r1`: *"tell me which of them are proposals rather than published"*.
    // The seat answered *"no publication state … I will not guess at it"* — honest, and the projection was the
    // defect (BOARD F-120). The vocabulary is the wiki application's own (`publicationOf` / `maturityOf`), so
    // chat, the CLI and the web cannot drift into three spellings of one state.
    documents: overview.documents.map((d) => ({
      slug: d.slug,
      title: d.title,
      publication: publicationOf({ status: (d.status ?? "published") as WikiPageStatus }),
      maturity: maturityOf({ maturity: d.maturity as WikiPageMaturity | undefined }),
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
      "Get a project container's identity and full overview: id, slug, status, accountable lead as a slug, " +
      "linked repository urls, documents, roadmap milestones, and recursive work items with assignees. " +
      "Use this to report or confirm what a work order is — its id, owner, and repositories. " +
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
