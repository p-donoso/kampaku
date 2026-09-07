import type { WikiPageDetail, WikiTreeResponse } from "../types";
import { fetchJson } from "./client";

/**
 * Retrieves the document/wiki tree for a project.
 * @param projectSlug - Project identifier.
 */
export function getWikiTree(projectSlug: string): Promise<WikiTreeResponse> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki`);
}

/**
 * Retrieves wiki page content, pending edits, and comment threads.
 * @param projectSlug - Project identifier.
 * @param pageSlug - Page slug.
 */
export function getWikiPage(projectSlug: string, pageSlug: string): Promise<WikiPageDetail> {
  return fetchJson(
    `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}`,
  );
}

/**
 * Posts a discussion comment or review note on a wiki page.
 */
export function postWikiComment(
  projectSlug: string,
  pageSlug: string,
  input: { content: string; author_name?: string; agent_slug?: string; parent_comment_id?: string },
): Promise<{ id: string; content: string; createdAt: string }> {
  return fetchJson(
    `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}/comments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

/**
 * Updates an existing project document or wiki page title/content.
 */
export function updateProjectDocument(
  id: string,
  input: { title?: string; content_md?: string },
): Promise<{ id: string; slug: string; title: string; contentMd: string }> {
  return fetchJson(`/api/v1/project-documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
