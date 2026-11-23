import type { AgentStore } from "../persistence/agent-store.js";
import type { PmStore, WorkItemRecord, WorkItemTreeNode } from "../persistence/pm-store.js";
import type { QuestionStore } from "../persistence/question-store.js";
import type { BlockageStore } from "../persistence/blockage-store.js";
import type { ProjectRecord, RepositoryReference, Store } from "../persistence/store.js";
import {
  enrichWorkItemExecution,
  executionPhaseLabel,
  type ExecutionPhase,
} from "./pm/execution-status.js";
import { isProjectAutoExecuting } from "./pm/execute-project.js";
import {
  getProjectExecutionGate,
  type ClosureReadContext,
} from "./pm/project-execution-gate.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { MemoryStore } from "../persistence/memory-store.js";
import {
  buildPendingEscalationWorkItemIds,
  ownBlockWorkItemIds,
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
  /**
   * Where the project's code lives, as the urls the container holds.
   *
   * The roster is the projection the web **table** renders, and it used to carry no repository field at
   * all — so the table could say how many projects existed and nothing about where their code lived,
   * while the detail panel one click away showed every path. Suite 02's oracle: *"The repository path is
   * shown as a path string on every surface that shows project metadata — not replaced by a count that
   * cannot be verified against disk."* A count is unverifiable; the url can be checked with `ls`
   * (BOARD F-037, closed by this field).
   */
  repositories: RepositoryReference[];
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
  /**
   * The refusal behind a `blocked_task` gate: the rule, the field it read, the item, and the command that
   * clears it. The web surface renders the label from this instead of from a title alone (BOARD F-088).
   */
  executionGateBlocked?: {
    code: string;
    field: string;
    rule: string;
    workItemId: string;
    workItemTitle: string;
    clearWith: string;
  };
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
  journalStore?: JournalStore,
  memoryStore?: MemoryStore,
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
  const gate = getProjectExecutionGate({
    pmStore,
    projectId: project.id,
    questionStore,
    blockageStore,
    journalStore,
    closureRead: { store, memoryStore, completionCtx: { store, questionStore } },
  });

  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description ?? "",
    status: project.status,
    projectLeadSlug,
    repositories: project.repositories,
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
    ...(gate.blocked
      ? {
          executionGateBlocked: {
            code: gate.blocked.code,
            field: gate.blocked.field,
            rule: gate.blocked.reason,
            workItemId: gate.blocked.workItemId,
            workItemTitle: gate.blocked.workItemTitle,
            clearWith: gate.blocked.clearWith,
          },
        }
      : {}),
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
  // Appended, never inserted: the parameter list is positional. The journal and memory stores are what let
  // the roster's gate sentence name the closure rule that blocked a leaf (BOARD F-088).
  journalStore?: JournalStore,
  memoryStore?: MemoryStore,
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
        ownBlockWorkItemIds(journalStore, project.id),
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
          journalStore,
          memoryStore,
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
