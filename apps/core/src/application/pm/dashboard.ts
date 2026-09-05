import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { PmStore, ProjectOverview, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { Store } from "../../persistence/store.js";
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

export function enrichProjectOverview(
  overview: ProjectOverview,
  agentStore: AgentStore,
  store: Store,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): ProjectOverview & { workItems: EnrichedWorkItemNode[] } {
  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const rolled = rollupWorkItemTreeWithExecution(
    overview.workItems,
    store,
    pendingEscalationIds(questionStore, blockageStore),
  );

  return {
    ...overview,
    workItems: withAssigneeSlugs(rolled, slugById),
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
  project: { id: string; slug: string; name: string };
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
  const rolledTree = withAssigneeSlugs(
    rollupWorkItemTreeWithExecution(
      pmStore.buildWorkItemTree(allItems),
      store,
      pendingEscalationIds(questionStore, blockageStore),
    ),
    slugById,
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
    },
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
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
