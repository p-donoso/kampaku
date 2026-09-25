import type {
  AgentDashboard,
  AgentMemory,
  AgentRecord,
  AgentRosterNode,
  AgentTreeNode,
} from "../types";
import { fetchJson } from "./client";
import { confirmDestructiveDelete, requestDestructiveDelete } from "./destructive";

/**
 * Lists all agents organized in a hierarchical tree.
 */
export function listAgents(): Promise<{ tree: AgentTreeNode[] }> {
  return fetchJson("/api/v1/agents?tree=true");
}

/**
 * Retrieves the full agent roster with workload and capability metrics.
 */
export function getAgentsRoster(): Promise<{ tree: AgentRosterNode[] }> {
  return fetchJson("/api/v1/agents/roster");
}

/**
 * Retrieves details for a specific agent by slug or ID.
 * @param slug - Agent identifier.
 */
export function getAgent(slug: string): Promise<AgentRecord> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}`);
}

/**
 * Retrieves operational dashboard metrics for an agent.
 * @param slug - Agent identifier.
 */
export function getAgentDashboard(slug: string): Promise<AgentDashboard> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}/dashboard`);
}

/**
 * Fetches recent memories (logs and learnings) associated with an agent.
 * @param slug - Agent identifier.
 */
export function getAgentMemories(slug: string): Promise<{
  memories: AgentMemory[];
  counts: { logs: number; learnings: number };
}> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}/memories?limit=100`);
}

/**
 * Updates properties of an existing sub-agent.
 * @param slug - Agent slug.
 * @param input - Fields to update.
 */
export function updateAgent(
  slug: string,
  input: {
    name?: string;
    responsibilities?: string;
    system_prompt?: string;
    parent_slug?: string;
  },
): Promise<AgentRecord> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Deletes a generated sub-agent, through the two-step gate the Core enforces.
 *
 * The human confirmation is the `window.confirm` the header action already shows; these two calls present
 * it to the server rather than trusting the client. Without the second step the first `DELETE` would only
 * record the request and the UI would close the panel over an agent that still exists.
 *
 * @param slug - Agent slug to delete.
 */
export async function deleteAgent(slug: string): Promise<void> {
  const path = `/api/v1/agents/${encodeURIComponent(slug)}`;
  const context = { entityType: "agent", action: "delete" } as const;
  const challenge = await requestDestructiveDelete(path, context);
  if (!challenge) return;
  await confirmDestructiveDelete(path, challenge, context);
}
