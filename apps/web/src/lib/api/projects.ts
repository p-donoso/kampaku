import type {
  GoalAudit,
  ProjectOverview,
  ProjectRecord,
  ProjectRosterTreeNode,
  WorkItemJournalEntry,
} from "../types";
import { fetchJson } from "./client";
import { deleteThroughGate, type DestructiveConfirmer } from "./destructive";

/**
 * Lists all registered projects.
 */
export function listProjects(): Promise<{ projects: ProjectRecord[] }> {
  return fetchJson("/api/v1/projects");
}

/**
 * Opens a work order — a container — from a surface that is not chat.
 *
 * Suite [16](../../../../../docs/eval/16-operator-ui.md) journey 5 is *"open a work order from the UI (create a
 * container) and confirm chat and CLI see it"*. Measured 2026-11-04: the operator's own projects page rendered a
 * roster and nothing that could create one, and the only intake form in the app submitted an **intent** to the
 * planner (`POST /api/v1/intents`), which is a different operation with a different object at the end of it. So
 * the container could be opened from chat, the CLI and REST and not from the browser (BOARD F-133).
 *
 * `project_lead_slug` is part of the body rather than an afterthought: a container with no accountable owner is not
 * an acceptable intake outcome (BOARD F-005/F-036), and the route validates the lead **before** persisting
 * anything, so a bad slug leaves no orphan behind.
 */
export function createProject(input: {
  slug?: string;
  name: string;
  description?: string;
  repositories?: Array<{ url: string; role?: string }>;
  project_lead_slug?: string;
}): Promise<ProjectRecord> {
  return fetchJson("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
 *
 * @param slug - Project slug to delete.
 * @param confirm - The human gate, asked with the server's recorded consequence.
 */
export async function deleteProject(slug: string, confirm: DestructiveConfirmer): Promise<void> {
  const path = `/api/v1/projects/${encodeURIComponent(slug)}`;
  await deleteThroughGate(path, { entityType: "project", action: "delete" }, confirm);
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
