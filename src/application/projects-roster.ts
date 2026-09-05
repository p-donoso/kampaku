import type { AgentStore } from "../persistence/agent-store.js";
import type { PmStore, WorkItemRecord, WorkItemTreeNode } from "../persistence/pm-store.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { ProjectRecord, Store } from "../persistence/store.js";
import {
  enrichWorkItemExecution,
  executionPhaseLabel,
  type ExecutionPhase,
} from "./pm/execution-status.js";
import { isProjectAutoExecuting } from "./pm/execute-project.js";
import { getProjectExecutionGate } from "./pm/project-execution-gate.js";
import {
  buildPendingEscalationWorkItemIds,
  rollupWorkItemTreeWithExecution,
} from "./pm/work-item-status-rollup.js";

export type ProjectHealth = "attention" | "active" | "idle";

export interface ProjectRosterEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  projectLeadSlug: string | null;
  health: ProjectHealth;
  activeTasks: number;
  failedTasks: number;
  pendingTasks: number;
  doneTasks: number;
  totalTasks: number;
  progressPct: number;
  pendingQuestions: number;
  pendingBlockers: number;
  currentTask?: { title: string; assigneeSlug: string | null; phase: string };
  autoExecute: boolean;
  executionGated: boolean;
  executionGateReason?: string;
  executionGateDetail?: string;
  lastActivityAt: string | null;
  updatedAt: string;
}

export interface ProjectRosterTaskNode {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  executionPhase?: ExecutionPhase;
  executionLabel?: string;
  assigneeSlug: string | null;
  children: ProjectRosterTaskNode[];
}

export interface ProjectRosterTreeNode {
  project: ProjectRosterEntry;
  tasks: ProjectRosterTaskNode[];
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function resolveHealth(
  failedCount: number,
  pendingQuestions: number,
  pendingBlockers: number,
  activeCount: number,
  phases: ExecutionPhase[],
): ProjectHealth {
  if (failedCount > 0 || pendingQuestions > 0 || pendingBlockers > 0) return "attention";
  if (phases.includes("running") || phases.includes("queued") || activeCount > 0) return "active";
  return "idle";
}

function mapTaskNode(
  node: WorkItemTreeNode & {
    item: WorkItemRecord & { executionPhase?: ExecutionPhase; executionLabel?: string };
  },
  slugById: Map<string, string>,
): ProjectRosterTaskNode {
  const item = node.item;
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    executionPhase: item.executionPhase,
    executionLabel: item.executionLabel,
    assigneeSlug: item.assigneeAgentId ? slugById.get(item.assigneeAgentId) ?? null : null,
    children: node.children.map((child) => mapTaskNode(child, slugById)),
  };
}

function buildProjectEntry(
  project: ProjectRecord,
  items: WorkItemRecord[],
  pendingQuestions: number,
  pendingBlockers: number,
  projectLeadSlug: string | null,
  slugById: Map<string, string>,
  store: Store,
  pmStore: PmStore,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): ProjectRosterEntry {
  const enriched = items.map((item) => enrichWorkItemExecution(item, store));

  let failedTasks = 0;
  let activeTasks = 0;
  let pendingTasks = 0;
  let doneTasks = 0;
  const phases: ExecutionPhase[] = [];
  let lastActivityAt: string | null = project.updatedAt;
  let currentTask: ProjectRosterEntry["currentTask"];

  for (const item of enriched) {
    phases.push(item.executionPhase);
    lastActivityAt = maxIso(lastActivityAt, item.updatedAt);

    const isFailed = item.status === "blocked" || item.executionPhase === "failed";
    const isActive =
      item.executionPhase === "queued" ||
      item.executionPhase === "running" ||
      item.status === "in_progress";
    const isDone = item.status === "done";

    if (isFailed) failedTasks++;
    if (isActive) activeTasks++;
    if (isDone) doneTasks++;
    if (!isFailed && !isDone && !isActive && item.status !== "cancelled") pendingTasks++;

    if (
      (item.executionPhase === "running" || item.executionPhase === "queued") &&
      !currentTask
    ) {
      currentTask = {
        title: item.title,
        assigneeSlug: item.assigneeAgentId ? slugById.get(item.assigneeAgentId) ?? null : null,
        phase: executionPhaseLabel(item.executionPhase),
      };
    }
  }

  const totalTasks = enriched.length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const gate = getProjectExecutionGate(pmStore, project.id, questionStore, blockageStore);

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? "",
    status: project.status,
    projectLeadSlug,
    health: resolveHealth(failedTasks, pendingQuestions, pendingBlockers, activeTasks, phases),
    activeTasks,
    failedTasks,
    pendingTasks,
    doneTasks,
    totalTasks,
    progressPct,
    pendingQuestions,
    pendingBlockers,
    currentTask,
    autoExecute: isProjectAutoExecuting(store, project.id),
    executionGated: gate.gated,
    executionGateReason: gate.reason,
    executionGateDetail: gate.detail,
    lastActivityAt,
    updatedAt: project.updatedAt,
  };
}

export function getProjectsRoster(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  questionStore?: QuestionStore,
  blockageStore?: BlockageStore,
): ProjectRosterTreeNode[] {
  const slugById = new Map(agentStore.listAllAgents().map((a) => [a.id, a.slug]));
  const pendingQuestionsByProject = questionStore?.countPendingByProject() ?? new Map<string, number>();
  const pendingBlockersByProject = blockageStore?.countPendingByProject() ?? new Map<string, number>();

  const itemsByProject = new Map<string, WorkItemRecord[]>();
  for (const item of pmStore.listAllWorkItems()) {
    const bucket = itemsByProject.get(item.projectId) ?? [];
    bucket.push(item);
    itemsByProject.set(item.projectId, bucket);
  }

  return store
    .listProjects()
    .map((project) => {
      const items = itemsByProject.get(project.id) ?? [];
      const leadSlug = project.projectLeadAgentId
        ? slugById.get(project.projectLeadAgentId) ?? null
        : null;
      const pendingWorkItemIds = buildPendingEscalationWorkItemIds([
        ...(questionStore?.listPending() ?? []),
        ...(blockageStore?.listPending() ?? []),
      ]);
      const taskTree = rollupWorkItemTreeWithExecution(
        pmStore.buildWorkItemTree(items),
        store,
        pendingWorkItemIds,
      ).map((node) => mapTaskNode(node, slugById));
      return {
        project: buildProjectEntry(
          project,
          items,
          pendingQuestionsByProject.get(project.id) ?? 0,
          pendingBlockersByProject.get(project.id) ?? 0,
          leadSlug,
          slugById,
          store,
          pmStore,
          questionStore,
          blockageStore,
        ),
        tasks: taskTree,
      };
    })
    .sort((a, b) => {
      const healthOrder: Record<ProjectHealth, number> = {
        attention: 0,
        active: 1,
        idle: 2,
      };
      const byHealth = healthOrder[a.project.health] - healthOrder[b.project.health];
      if (byHealth !== 0) return byHealth;
      return b.project.updatedAt.localeCompare(a.project.updatedAt);
    });
}
