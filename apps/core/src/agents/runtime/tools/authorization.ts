import type { AgentStore } from "../../../persistence/agent-store.js";
import type { PmStore, WorkItemRecord } from "../../../persistence/pm-store.js";
import type { ProjectRecord, Store } from "../../../persistence/store.js";

/**
 * The project an agent is the **linked lead** of, when one can be resolved unambiguously.
 *
 * The same authority [ADR-0006](../../../../../docs/adr/0006-project-lead-creates-seats.md) established for
 * seats — *"is the linked lead of a project"*, read from `projectLeadAgentId` rather than inferred from a
 * slug suffix — applied to planning. Measured 2026-09-25 in the suite-05 run: a container's own lead was
 * refused by `submit_intent` with *"This agent is not authorized to create project plans or subtasks"*
 * because it held neither `system-delegation` nor `workflow-specialist-delegation`, and then asked the
 * emperor *"Should I operate as that agent, or do you need to grant authorization to this agent?"* — about
 * itself (BOARD F-046). The front office's own prompt instructs it to *"have that lead preview, approve,
 * apply, and execute a concrete plan"*, so a lead that cannot plan makes that instruction unreachable.
 *
 * Resolution order, and it is deliberately narrow: the project the caller named; failing that, the single
 * project it leads. An agent that leads nothing, or that names a project it does not lead, still gets the
 * original refusal — this widens *who may plan a project*, not *who may plan anything*.
 */
export function ledProjectFor(
  store: Store,
  agentId: string,
  projectSlugOrId?: string,
): ProjectRecord | undefined {
  const named = projectSlugOrId?.trim()
    ? store.getProjectByIdOrSlug(projectSlugOrId.trim())
    : undefined;
  if (named) return named.projectLeadAgentId === agentId ? named : undefined;

  const led = store.listProjects().filter((project) => project.projectLeadAgentId === agentId);
  return led.length === 1 ? led[0] : undefined;
}

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
