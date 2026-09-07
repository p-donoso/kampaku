import type { WorkItemDetail, WorkItemJournalEntry, WorkItemRecord } from "../types";
import { fetchJson, getBaseUrl } from "./client";

/**
 * Checks reporting obligations and wiki sync requirements for a work item.
 */
export function getReportingStatus(
  workItemId: string,
  params?: { agentSlug?: string; projectId?: string; requireWikiSync?: boolean },
) {
  const query = new URLSearchParams();
  if (params?.agentSlug) query.set("agent_slug", params.agentSlug);
  if (params?.projectId) query.set("project_id", params.projectId);
  if (params?.requireWikiSync) query.set("require_wiki_sync", "true");
  return fetchJson<Record<string, unknown>>(
    `/api/v1/work-items/${encodeURIComponent(workItemId)}/reporting-status?${query}`,
  );
}

/**
 * Creates a new work item inside a project.
 */
export function createWorkItem(
  projectId: string,
  input: {
    title: string;
    description?: string;
    parent_id?: string | null;
    status?: string;
    priority?: number;
    sort_order?: number;
    assignee_agent_id?: string;
  },
): Promise<WorkItemRecord> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/work-items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Retrieves full details and hierarchy context for a work item.
 */
export function getWorkItemDetail(id: string): Promise<WorkItemDetail> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}`);
}

/**
 * Updates properties of a work item.
 */
export function updateWorkItem(
  id: string,
  input: {
    title?: string;
    description?: string;
    status?: string;
    priority?: number;
    sort_order?: number;
    parent_id?: string | null;
    assignee_agent_id?: string;
  },
): Promise<WorkItemRecord> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Deletes a work item, optionally cascading to child leaves.
 */
export function deleteWorkItem(id: string, cascade = false): Promise<void> {
  const query = cascade ? "?cascade=true" : "";
  return fetch(`${getBaseUrl()}/api/v1/work-items/${encodeURIComponent(id)}${query}`, {
    method: "DELETE",
  }).then((res) => {
    if (!res.ok) {
      return res.text().then((body) => {
        throw new Error(`${id}: ${res.status} ${body}`);
      });
    }
  });
}

/**
 * Dispatches a work item to execution.
 */
export function executeWorkItem(id: string): Promise<{
  workItemId: string;
  goalId: string;
  jobId: string;
  objective: string;
  repositoryRole: string;
}> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}/execute`, { method: "POST" });
}

/**
 * Retries a failed or blocked work item.
 */
export function retryWorkItem(id: string): Promise<{
  workItemId: string;
  goalId: string;
  jobId: string;
  objective: string;
  repositoryRole: string;
}> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

/**
 * Pauses an in-flight job run.
 */
export function pauseJobRun(jobId: string): Promise<{ id: string; status: string }> {
  return fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/pause`, { method: "POST" });
}

/**
 * Resumes a paused job run.
 */
export function resumeJobRun(jobId: string): Promise<{ id: string; status: string }> {
  return fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/resume`, { method: "POST" });
}

/**
 * Cancels a job run.
 */
export function cancelJobRun(jobId: string): Promise<{ jobId: string; status: string }> {
  return fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

/**
 * Retrieves journal events associated with a work item.
 */
export function getWorkItemJournal(
  workItemId: string,
  query = "",
): Promise<{ entries: WorkItemJournalEntry[] }> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(workItemId)}/journal${query}`);
}
