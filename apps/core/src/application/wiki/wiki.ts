import type { AgentStore } from "../../persistence/agent-store.js";
import type { Store } from "../../persistence/store.js";
import type { WikiCommentRecord, WikiPageRecord, WikiStore } from "../../persistence/wiki-store.js";
import { WikiStoreError } from "../../persistence/wiki-store.js";
import { getProjectByIdOrSlug } from "../projects.js";
import { buildPagesBySlug, resolveWikiLinks, type WikiLinkRef } from "./cross-refs.js";
import { countWikiPages, syncRoadmapWikiPage } from "./roadmap-sync.js";
import type { PmStore } from "../../persistence/pm-store.js";

export class WikiServiceError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "WikiServiceError";
  }
}

export interface WikiPageDetail {
  page: WikiPageRecord;
  links: WikiLinkRef[];
  backlinks: Array<{ slug: string; title: string; pageId: string }>;
  comments: WikiCommentTreeNode[];
  pendingEdit?: {
    title?: string;
    contentMd: string;
    proposedByAgentId?: string;
    proposedBySlug?: string;
    proposedAt?: string;
  };
}

export interface WikiCommentTreeNode {
  comment: WikiCommentRecord & { authorSlug?: string };
  children: WikiCommentTreeNode[];
}

function wrapStoreError(error: unknown): never {
  if (error instanceof WikiStoreError) {
    throw new WikiServiceError(error.message, error.code);
  }
  throw error;
}

function resolveProject(store: Store, idOrSlug: string) {
  const project = getProjectByIdOrSlug(store, idOrSlug);
  if (!project) throw new WikiServiceError("Project not found.", "NOT_FOUND");
  return project;
}

function assertProjectLead(
  store: Store,
  agentStore: AgentStore,
  projectId: string,
  agentSlugOrId: string,
): void {
  const project = store.getProject(projectId);
  if (!project?.projectLeadAgentId) {
    throw new WikiServiceError("Project has no lead agent assigned.", "FORBIDDEN");
  }
  const agent = agentStore.getAgentBySlugOrId(agentSlugOrId);
  if (!agent || agent.id !== project.projectLeadAgentId) {
    throw new WikiServiceError("Only the project lead can approve or reject wiki edits.", "FORBIDDEN");
  }
}

function resolveAgentId(agentStore: AgentStore, slugOrId: string): string {
  const agent = agentStore.getAgentBySlugOrId(slugOrId);
  if (!agent) throw new WikiServiceError("Agent not found.", "NOT_FOUND");
  return agent.id;
}

function enrichComments(
  comments: WikiCommentRecord[],
  agentStore: AgentStore,
): WikiCommentTreeNode[] {
  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const byParent = new Map<string | null, Array<WikiCommentRecord & { authorSlug?: string }>>();

  for (const comment of comments) {
    const enriched = {
      ...comment,
      authorSlug: comment.authorAgentId ? slugById.get(comment.authorAgentId) : undefined,
    };
    const key = comment.parentCommentId ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(enriched);
    byParent.set(key, bucket);
  }

  const build = (parentId: string | null): WikiCommentTreeNode[] => {
    const nodes = byParent.get(parentId) ?? [];
    return nodes.map((comment) => ({
      comment,
      children: build(comment.id),
    }));
  };

  return build(null);
}

export function getWikiTree(
  store: Store,
  pmStore: PmStore,
  wikiStore: WikiStore,
  projectIdOrSlug: string,
) {
  const project = resolveProject(store, projectIdOrSlug);
  syncRoadmapWikiPage(store, pmStore, wikiStore, project.id);
  const pages = wikiStore.listPagesByProject(project.id).filter((p) => p.status !== "archived");
  const tree = wikiStore.buildPageTree(pages);
  return {
    projectId: project.id,
    projectSlug: project.slug,
    tree,
    pageCount: countWikiPages(tree),
    pendingCount: pages.filter((p) => p.status === "pending_approval").length,
    hasRoadmap: pages.some((p) => p.slug === "roadmap"),
  };
}

export function getWikiPageDetail(
  store: Store,
  wikiStore: WikiStore,
  agentStore: AgentStore,
  projectIdOrSlug: string,
  pageSlug: string,
): WikiPageDetail {
  const project = resolveProject(store, projectIdOrSlug);
  const page = wikiStore.getPageBySlug(project.id, pageSlug);
  if (!page) throw new WikiServiceError("Wiki page not found.", "NOT_FOUND");

  const allPages = wikiStore.listPagesByProject(project.id);
  const bySlug = buildPagesBySlug(allPages);
  const links = resolveWikiLinks(page.contentMd, bySlug);
  const backlinks = wikiStore
    .findBacklinks(project.id, page.slug)
    .filter((p) => p.id !== page.id)
    .map((p) => ({ slug: p.slug, title: p.title, pageId: p.id }));

  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const pendingEdit =
    page.status === "pending_approval" && page.proposedContentMd
      ? {
          title: page.proposedTitle,
          contentMd: page.proposedContentMd,
          proposedByAgentId: page.proposedByAgentId,
          proposedBySlug: page.proposedByAgentId
            ? slugById.get(page.proposedByAgentId)
            : undefined,
          proposedAt: page.proposedAt,
        }
      : undefined;

  return {
    page,
    links,
    backlinks,
    comments: enrichComments(wikiStore.listCommentsByPage(page.id), agentStore),
    pendingEdit,
  };
}

export function createWikiPage(
  store: Store,
  wikiStore: WikiStore,
  projectIdOrSlug: string,
  input: {
    slug: string;
    title: string;
    contentMd?: string;
    parentId?: string;
    parentSlug?: string;
  },
) {
  const project = resolveProject(store, projectIdOrSlug);
  let parentId = input.parentId;
  if (input.parentSlug && !parentId) {
    const parent = wikiStore.getPageBySlug(project.id, input.parentSlug);
    if (!parent) throw new WikiServiceError("Parent page not found.", "NOT_FOUND");
    parentId = parent.id;
  }

  try {
    return wikiStore.createPage({
      projectId: project.id,
      parentId,
      slug: input.slug,
      title: input.title,
      contentMd: input.contentMd,
      status: "published",
    });
  } catch (error) {
    wrapStoreError(error);
  }
}

export function updateWikiPageDirect(
  store: Store,
  wikiStore: WikiStore,
  pageId: string,
  patch: { title?: string; contentMd?: string; parentId?: string; sortOrder?: number },
) {
  try {
    return wikiStore.updatePageDirect(pageId, patch);
  } catch (error) {
    wrapStoreError(error);
  }
}

/**
 * Proposes a page's content, creating the page when nothing holds that slug yet.
 *
 * It used to refuse with `Wiki page not found.`, and the refusal was the visible half of a real gap: agents
 * hold an **edit** path and no **create** path, so a plan's own scope page could not be proposed by the lead
 * that wrote the plan. Measured 2026-09-29 by suite 07 run 20, the first run in which the store reached the
 * chat path at all: the lead probed the new slug three times — under both the slug and the UUID — got
 * `Wiki page not found.` every time, and then **proved the store was reachable** by proposing an edit against
 * the existing `roadmap` page, which returned *"Edit proposed. Pending project lead approval."* So the tool
 * reached the wiki and only creation failed. A store that answers an outage question with a create-path
 * limitation is a store whose refusal misdirects the reader (BOARD F-071).
 *
 * **Created as `pending_approval`, never as published.** Creating the *container* is what was missing;
 * publishing content is still the project lead's approval, exactly as for an edit. The distinction the wiki
 * rests on — agents propose, the lead publishes — is not weakened by letting a proposal name a page that does
 * not exist yet, and the alternative was worse in the other direction: the register a plan cites went into one
 * agent's private memory and was unreadable by the operator and by the phase audit.
 *
 * A page the human or another agent is about to create is a race this does not arbitrate: `createPage` rejects
 * a duplicate slug as a conflict, and that refusal is left as it is rather than being retried into an edit.
 */
export function proposeWikiEdit(
  store: Store,
  wikiStore: WikiStore,
  agentStore: AgentStore,
  projectIdOrSlug: string,
  pageSlug: string,
  input: { agentSlug: string; title?: string; contentMd: string },
) {
  const project = resolveProject(store, projectIdOrSlug);
  const agentId = resolveAgentId(agentStore, input.agentSlug);
  const normalizedSlug = pageSlug.trim();
  if (!normalizedSlug) throw new WikiServiceError("A page slug is required.", "VALIDATION");
  let page = wikiStore.getPageBySlug(project.id, normalizedSlug);

  if (!page) {
    try {
      page = wikiStore.createPage({
        projectId: project.id,
        slug: normalizedSlug,
        title: input.title?.trim() || normalizedSlug,
        contentMd: "",
        status: "pending_approval",
      });
    } catch (error) {
      wrapStoreError(error);
    }
  }

  try {
    return wikiStore.proposeEdit(page.id, {
      title: input.title,
      contentMd: input.contentMd,
      proposedByAgentId: agentId,
    });
  } catch (error) {
    wrapStoreError(error);
  }
}

export function approveWikiEdit(
  store: Store,
  wikiStore: WikiStore,
  agentStore: AgentStore,
  projectIdOrSlug: string,
  pageSlug: string,
  agentSlug: string,
) {
  const project = resolveProject(store, projectIdOrSlug);
  assertProjectLead(store, agentStore, project.id, agentSlug);
  const page = wikiStore.getPageBySlug(project.id, pageSlug);
  if (!page) throw new WikiServiceError("Wiki page not found.", "NOT_FOUND");

  const agentId = resolveAgentId(agentStore, agentSlug);
  try {
    return wikiStore.approveEdit(page.id, agentId);
  } catch (error) {
    wrapStoreError(error);
  }
}

export function rejectWikiEdit(
  store: Store,
  wikiStore: WikiStore,
  agentStore: AgentStore,
  projectIdOrSlug: string,
  pageSlug: string,
  agentSlug: string,
) {
  const project = resolveProject(store, projectIdOrSlug);
  assertProjectLead(store, agentStore, project.id, agentSlug);
  const page = wikiStore.getPageBySlug(project.id, pageSlug);
  if (!page) throw new WikiServiceError("Wiki page not found.", "NOT_FOUND");

  try {
    return wikiStore.rejectEdit(page.id);
  } catch (error) {
    wrapStoreError(error);
  }
}

export function postWikiComment(
  store: Store,
  wikiStore: WikiStore,
  agentStore: AgentStore,
  projectIdOrSlug: string,
  pageSlug: string,
  input: {
    content: string;
    agentSlug?: string;
    authorName?: string;
    parentCommentId?: string;
  },
) {
  const project = resolveProject(store, projectIdOrSlug);
  const page = wikiStore.getPageBySlug(project.id, pageSlug);
  if (!page) throw new WikiServiceError("Wiki page not found.", "NOT_FOUND");

  const authorAgentId = input.agentSlug
    ? resolveAgentId(agentStore, input.agentSlug)
    : undefined;

  try {
    return wikiStore.addComment({
      pageId: page.id,
      projectId: project.id,
      content: input.content,
      parentCommentId: input.parentCommentId,
      authorAgentId,
      authorName: input.authorName,
    });
  } catch (error) {
    wrapStoreError(error);
  }
}

export function listWikiPending(
  store: Store,
  wikiStore: WikiStore,
  agentStore: AgentStore,
  projectIdOrSlug: string,
  agentSlug?: string,
) {
  const project = resolveProject(store, projectIdOrSlug);
  if (agentSlug) {
    assertProjectLead(store, agentStore, project.id, agentSlug);
  }

  const pages = wikiStore.listPendingPages(project.id);
  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));

  return pages.map((page) => ({
    ...page,
    proposedBySlug: page.proposedByAgentId ? slugById.get(page.proposedByAgentId) : undefined,
  }));
}
