import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore, ProjectOverview, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { Store } from "../../persistence/store.js";
import {
  deriveWorkItemComplexity,
  type WorkItemComplexity,
} from "../../delegator/work-item-complexity.js";
import type { PlanGranularity } from "../../delegator/plan-granularity.js";
import { getProjectByIdOrSlug } from "../projects.js";
import { type ExecutionPhase } from "./execution-status.js";
import {
  buildPendingEscalationWorkItemIds,
  rollupWorkItemTreeWithExecution,
  type ExecutionWorkItemNode,
} from "./work-item-status-rollup.js";

function pendingEscalationIds(
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): Set<string> {
  return buildPendingEscalationWorkItemIds([
    ...(questionStore?.listPending() ?? []),
    ...(blockageStore?.listPending() ?? []),
  ]);
}

function findWorkItemNode<T extends { item: WorkItemRecord; children: T[] }>(
  nodes: T[],
  workItemId: string,
): T | undefined {
  for (const node of nodes) {
    if (node.item.id === workItemId) return node;
    const nested = findWorkItemNode(node.children, workItemId);
    if (nested) return nested;
  }
  return undefined;
}

export function getProjectOverview(
  store: Store,
  pmStore: PmStore,
  idOrSlug: string,
): ProjectOverview | undefined {
  const project = getProjectByIdOrSlug(store, idOrSlug);
  if (!project) return undefined;
  return pmStore.getProjectOverview(project);
}

type EnrichedWorkItem = WorkItemRecord & {
  assigneeSlug?: string;
  jobStatus?: string;
  executionPhase: ExecutionPhase;
  executionLabel: string;
};

type EnrichedWorkItemNode = {
  item: EnrichedWorkItem;
  children: EnrichedWorkItemNode[];
};

function countDescendantLeaves(node: EnrichedWorkItemNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countDescendantLeaves(child), 0);
}

function withComplexity(
  nodes: EnrichedWorkItemNode[],
  granularity: PlanGranularity | undefined,
  depth = 0,
): EnrichedWorkItemNode[] {
  return nodes.map((node) => {
    const children = withComplexity(node.children, granularity, depth + 1);
    const isContainer = children.length > 0;
    const leafCount = isContainer
      ? children.reduce((sum, child) => sum + countDescendantLeaves(child), 0)
      : 1;
    const derived = deriveWorkItemComplexity({
      title: node.item.title,
      description: node.item.description,
      acceptanceCriteria: node.item.acceptanceCriteria,
      granularity,
      depth,
      role: isContainer ? "container" : "leaf",
      leafCount,
    });
    const stored = node.item.complexity;
    const complexity: WorkItemComplexity = stored
      ? {
          ...stored,
          depth: stored.depth ?? depth,
          role: isContainer ? "container" : "leaf",
          leafCount: isContainer ? leafCount : stored.leafCount || 1,
          granularity: stored.granularity ?? granularity ?? derived.granularity,
        }
      : derived;
    return {
      item: { ...node.item, complexity },
      children,
    };
  });
}

function withAssigneeSlugs(
  nodes: ExecutionWorkItemNode[],
  slugById: Map<string, string>,
): EnrichedWorkItemNode[] {
  return nodes.map((node) => ({
    item: {
      ...node.item,
      assigneeSlug: node.item.assigneeAgentId
        ? slugById.get(node.item.assigneeAgentId)
        : undefined,
    },
    children: withAssigneeSlugs(node.children, slugById),
  }));
}

export type EnrichedProjectOverview = ProjectOverview & {
  /**
   * The container's owner, as the **slug** every other surface spells it with (BOARD F-109).
   *
   * The stored field is `projectLeadAgentId` — an agent id — and the id is what REST used to answer, while
   * chat, the web UI and the durable-state block all resolve and render the slug. Suite 01's oracle asks the
   * surfaces to "agree on the project slug/id, the **owner slug**, and the repository path string", and a
   * surface that answers an id where the others answer a slug agrees about the value and not about the name.
   * Resolving it here, beside the item assignee slugs this function already resolves from the same map, is
   * the one place it can be done without a second lookup: the map is already built below.
   *
   * `null` when the container has no owner **or** when the id resolves to no agent, which are different
   * states the caller can tell apart by reading `projectLeadAgentId` beside it — a resolved slug that is
   * silently the id is the defect this field exists to remove.
   */
  project: ProjectOverview["project"] & { projectLeadSlug: string | null };
  workItems: EnrichedWorkItemNode[];
};

export function enrichProjectOverview(
  overview: ProjectOverview,
  agentStore: AgentStore,
  store: Store,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): EnrichedProjectOverview {
  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const rolled = rollupWorkItemTreeWithExecution(
    overview.workItems,
    store,
    pendingEscalationIds(questionStore, blockageStore),
  );

  return {
    ...overview,
    project: {
      ...overview.project,
      projectLeadSlug: overview.project.projectLeadAgentId
        ? slugById.get(overview.project.projectLeadAgentId) ?? null
        : null,
    },
    workItems: withComplexity(
      withAssigneeSlugs(rolled, slugById),
      overview.project.planGranularity,
    ),
  };
}

export function getEnrichedProjectOverview(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  idOrSlug: string,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
) {
  const overview = getProjectOverview(store, pmStore, idOrSlug);
  if (!overview) return undefined;
  return enrichProjectOverview(overview, agentStore, store, questionStore, blockageStore);
}

export interface WorkItemChildSummary {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
}

export interface WorkItemTaskOption {
  id: string;
  title: string;
  parentId: string | null;
}

export interface WorkItemDetail {
  item: EnrichedWorkItem & {
    routingReason?: string;
    acceptanceCriteria: string[];
    dependsOn: string[];
  };
  project: { id: string; slug: string; name: string; planGranularity?: PlanGranularity };
  parent?: { id: string; title: string };
  children: WorkItemChildSummary[];
  projectTasks: WorkItemTaskOption[];
}

export function getWorkItemDetail(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  workItemId: string,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): WorkItemDetail | undefined {
  const workItem = pmStore.getWorkItem(workItemId);
  if (!workItem) return undefined;

  const project = store.getProject(workItem.projectId);
  if (!project) return undefined;

  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const allItems = pmStore.listWorkItemsByProject(workItem.projectId);
  const rolledTree = withComplexity(
    withAssigneeSlugs(
      rollupWorkItemTreeWithExecution(
        pmStore.buildWorkItemTree(allItems),
        store,
        pendingEscalationIds(questionStore, blockageStore),
      ),
      slugById,
    ),
    project.planGranularity,
  );
  const node = findWorkItemNode(rolledTree, workItemId);
  if (!node) return undefined;

  const parent = workItem.parentId ? findWorkItemNode(rolledTree, workItem.parentId) : undefined;

  const children = node.children
    .map((child) => ({
      id: child.item.id,
      title: child.item.title,
      status: child.item.status,
      sortOrder: child.item.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    item: {
      ...node.item,
      routingReason: workItem.routingReason,
      acceptanceCriteria: workItem.acceptanceCriteria,
      dependsOn: workItem.dependsOn,
      complexity: node.item.complexity,
    },
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      planGranularity: project.planGranularity,
    },
    parent: parent ? { id: parent.item.id, title: parent.item.title } : undefined,
    children,
    projectTasks: allItems.map((i) => ({
      id: i.id,
      title: i.title,
      parentId: i.parentId ?? null,
    })),
  };
}

export interface AgentDashboardWorkItem {
  id: string;
  title: string;
  status: string;
  projectSlug: string;
  projectName: string;
  assigneeSlug: string;
  routingReason?: string;
}

export interface AgentDashboard {
  agentSlug: string;
  agentName: string;
  includeSubordinates: boolean;
  byStatus: Record<string, AgentDashboardWorkItem[]>;
  total: number;
}

export function getAgentDashboard(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  slugOrId: string,
  includeSubordinates = true,
): AgentDashboard | undefined {
  const agent = agentStore.getAgentBySlugOrId(slugOrId);
  if (!agent) return undefined;

  const agentIds = includeSubordinates
    ? agentStore.getAgentIdsWithSubordinates(agent.id)
    : [agent.id];

  const slugById = new Map(
    agentStore.listAllAgents().map((a) => [a.id, a.slug]),
  );

  const items = pmStore.listWorkItemsForAgents(agentIds);
  const byStatus: Record<string, AgentDashboardWorkItem[]> = {};

  for (const item of items) {
    const project = store.getProject(item.projectId);
    if (!project) continue;

    const entry: AgentDashboardWorkItem = {
      id: item.id,
      title: item.title,
      status: item.status,
      projectSlug: project.slug,
      projectName: project.name,
      assigneeSlug: item.assigneeAgentId
        ? (slugById.get(item.assigneeAgentId) ?? "unknown")
        : "unassigned",
      routingReason: item.routingReason,
    };

    const bucket = byStatus[item.status] ?? [];
    bucket.push(entry);
    byStatus[item.status] = bucket;
  }

  return {
    agentSlug: agent.slug,
    agentName: agent.name,
    includeSubordinates,
    byStatus,
    total: items.length,
  };
}
