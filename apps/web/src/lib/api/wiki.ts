import type { WikiPageDetail, WikiPageRecord, WikiTreeResponse } from "../types";
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
/**
 * Approves a pending page or a pending edit, as the role the platform authorises for it.
 *
 * The Core route enforces that the caller **is the project's linked lead** (`assertProjectLead`), so the agent
 * slug is required rather than guessed: the panel reads `projectLeadSlug` off the project and sends that. A UI
 * that sent its own identity would be refused, and a UI that sent nothing would be answered `400`.
 *
 * Suite [16](../../../../../docs/eval/16-operator-ui.md) journey 4 is this call: *"find a pending proposal, and
 * approve or reject it from the UI as the authorized role"*, and journey 4's page had the pending edit rendered
 * with **no control at all** until BOARD F-133 — the operator could read a proposal in the browser and had to
 * leave for the CLI to decide it.
 */
export function approveWikiPage(
  projectSlug: string,
  pageSlug: string,
  agentSlug: string,
): Promise<WikiPageRecord> {
  return fetchJson(
    `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}/approve`,
    { method: "POST", body: JSON.stringify({ agent_slug: agentSlug }) },
  );
}

/** Rejects a pending page or edit. The page returns to `draft` and is published by nothing. */
export function rejectWikiPage(
  projectSlug: string,
  pageSlug: string,
  agentSlug: string,
): Promise<WikiPageRecord> {
  return fetchJson(
    `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}/reject`,
    { method: "POST", body: JSON.stringify({ agent_slug: agentSlug }) },
  );
}

export function updateProjectDocument(
  id: string,
  input: { title?: string; content_md?: string },
): Promise<{ id: string; slug: string; title: string; contentMd: string }> {
  return fetchJson(`/api/v1/project-documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
