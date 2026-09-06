import type { AgentStore } from "../../../persistence/agent-store.js";
import type { PmStore, WorkItemRecord } from "../../../persistence/pm-store.js";
import type { Store } from "../../../persistence/store.js";

export function isAgentProjectOwner(
  agentStore: AgentStore,
  pmStore: PmStore,
  store: Store,
  agentId: string,
  projectId: string,
): boolean {
  if (!agentStore.getAgentBySlugOrId(agentId)) return false;
  const project = store.getProject(projectId);
  if (project?.projectLeadAgentId === agentId) return true;

  return pmStore.listWorkItemsByProject(projectId).some(
    (item) => item.assigneeAgentId === agentId || item.assignedByAgentId === agentId,
  );
}

function ownsWorkItemOrAncestor(
  agentId: string,
  workItem: WorkItemRecord,
  pmStore: PmStore,
): boolean {
  let current: WorkItemRecord | undefined = workItem;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.assigneeAgentId === agentId || current.assignedByAgentId === agentId) return true;
    current = current.parentId ? pmStore.getWorkItem(current.parentId) : undefined;
  }
  return false;
}

export function assertWorkItemMutationScope(
  agentStore: AgentStore,
  pmStore: PmStore,
  store: Store,
  agentId: string,
  workItem: WorkItemRecord,
): void {
  if (!isAgentProjectOwner(agentStore, pmStore, store, agentId, workItem.projectId)) {
    throw new Error("Agent is not assigned to or leading this project.");
  }
  if (!ownsWorkItemOrAncestor(agentId, workItem, pmStore) && store.getProject(workItem.projectId)?.projectLeadAgentId !== agentId) {
    throw new Error("Agent is outside this work item's ownership scope.");
  }
}

export function assertSubAgentParentScope(
  agentStore: AgentStore,
  actorId: string,
  parentId: string,
): void {
  let current = agentStore.getAgentBySlugOrId(parentId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.id === actorId) return;
    visited.add(current.id);
    current = current.parentId ? agentStore.getAgentBySlugOrId(current.parentId) : undefined;
  }
  throw new Error("Agent may create sub-agents only under itself or its descendant hierarchy.");
}

/** Actor may mutate/delete a target only when the target sits under the actor's hierarchy. */
export function assertSubAgentMutationTargetScope(
  agentStore: AgentStore,
  actorId: string,
  targetSlugOrId: string,
): void {
  const target = agentStore.getAgentBySlugOrId(targetSlugOrId);
  if (!target) {
    throw new Error("Target agent was not found.");
  }
  if (target.slug === "kampaku") {
    throw new Error("Built-in kampaku cannot be deleted or rewritten this way.");
  }
  const parentRef = target.parentId ?? "kampaku";
  assertSubAgentParentScope(agentStore, actorId, parentRef);
}
