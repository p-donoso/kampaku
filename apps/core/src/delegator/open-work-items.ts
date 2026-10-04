import type { AgentStore } from "../persistence/agent-store.js";
import type { WorkItemRecord } from "../persistence/pm-store.js";

export interface OpenWorkItemSummary {
  id: string;
  title: string;
  status: string;
  parentTitle?: string;
  assigneeSlug?: string;
  description?: string;
  acceptanceCriteria: string[];
  /**
   * Paths this item's job must not write, as the plan declares them.
   *
   * Carried into the open-work list because it is part of what the item *is*, and because an item whose freeze
   * is invisible reads as an item that may touch anything.
   */
  frozenPaths: string[];
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);

export function listOpenWorkItems(
  items: WorkItemRecord[],
  agentStore: AgentStore,
): OpenWorkItemSummary[] {
  const titleById = new Map(items.map((item) => [item.id, item.title]));
  const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));

  return items
    .filter((item) => !CLOSED_STATUSES.has(item.status))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      parentTitle: item.parentId ? titleById.get(item.parentId) : undefined,
      assigneeSlug: item.assigneeAgentId ? slugById.get(item.assigneeAgentId) : undefined,
      description: item.description,
      acceptanceCriteria: item.acceptanceCriteria,
      frozenPaths: item.frozenPaths,
    }));
}
