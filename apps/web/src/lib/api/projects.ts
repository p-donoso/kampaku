import type {
  GoalAudit,
  ProjectOverview,
  ProjectRecord,
  ProjectRosterTreeNode,
  WorkItemJournalEntry,
} from "../types";
import { fetchJson } from "./client";
import { confirmDestructiveDelete, requestDestructiveDelete } from "./destructive";

/**
 * Lists all registered projects.
 */
export function listProjects(): Promise<{ projects: ProjectRecord[] }> {
  return fetchJson("/api/v1/projects");
}

/**
 * Retrieves the hierarchical project roster tree.
 */
export function getProjectsRoster(): Promise<{ projects: ProjectRosterTreeNode[] }> {
  return fetchJson("/api/v1/projects/roster");
}

/**
 * Fetches comprehensive project details including documents, milestones, and work items.
 * @param slug - Project slug or identifier.
 */
export function getProjectOverview(slug: string): Promise<ProjectOverview> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}`);
}

/**
 * Records cryptographic/hash-locked approval for a proposed project plan.
 */
export function approvePlan(input: {
  agent_slug: string;
  project_slug: string;
  approval_reference: string;
  plan_fingerprint: string;
  plan_content_hash: string;
  expires_at?: string;
}) {
  return fetchJson<Record<string, unknown>>("/api/v1/plans/approve", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Revokes prior plan approval.
 */
export function revokePlanApproval(input: {
  agent_slug: string;
  project_slug: string;
  approval_reference: string;
  plan_fingerprint: string;
  plan_content_hash: string;
}) {
  return fetchJson<Record<string, unknown>>("/api/v1/plans/revoke", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Resumes automated durable execution for a project.
 * @param slug - Project identifier.
 */
export function playProject(slug: string): Promise<{
  autoExecute: true;
  started?: {
    workItemId: string;
    goalId: string;
    jobId: string;
    objective: string;
    repositoryRole: string;
  };
  nextWorkItemId?: string | null;
}> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}/play`, { method: "POST" });
}

/**
 * Pauses automated execution for a project.
 * @param slug - Project identifier.
 */
export function pauseProject(slug: string): Promise<{ autoExecute: false }> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}/pause`, { method: "POST" });
}

/**
 * Checks current auto-execution status and gating state for a project.
 * @param slug - Project identifier.
 */
export function getProjectExecution(slug: string): Promise<{
  autoExecute: boolean;
  gated: boolean;
  gate: { gated: boolean; reason?: string; detail?: string };
}> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}/execution`);
}

/**
 * Updates project metadata and status.
 * @param slug - Project slug.
 * @param input - Fields to update.
 */
export function updateProject(
  slug: string,
  input: { name?: string; description?: string; status?: string },
): Promise<ProjectRecord> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Deletes a project, through the two-step gate the Core enforces (see `deleteAgent`).
 * @param slug - Project slug to delete.
 */
export async function deleteProject(slug: string): Promise<void> {
  const path = `/api/v1/projects/${encodeURIComponent(slug)}`;
  const context = { entityType: "project", action: "delete" } as const;
  const challenge = await requestDestructiveDelete(path, context);
  if (!challenge) return;
  await confirmDestructiveDelete(path, challenge, context);
}

/**
 * Retrieves the operational journal entries for a project.
 * @param projectId - Project ID.
 * @param query - Optional search/filter query.
 */
export function getProjectJournal(
  projectId: string,
  query = "",
): Promise<{ entries: WorkItemJournalEntry[] }> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/journal${query}`);
}

/**
 * Fetches audit log and job execution history for a goal.
 * @param goalId - Unique goal identifier.
 */
export function getGoalAudit(goalId: string): Promise<GoalAudit> {
  return fetchJson(`/api/v1/goals/${encodeURIComponent(goalId)}`);
}

/**
 * Submits an intent for decomposition and delegation.
 * @param input - Intent specification and options.
 */
export function submitIntent(input: {
  intent: string;
  projectSlug?: string;
  createMissingAgents?: boolean;
  granularity?: "standard" | "fine";
}): Promise<Record<string, unknown>> {
  return fetchJson("/api/v1/intents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
