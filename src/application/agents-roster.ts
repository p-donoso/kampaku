import type { AgentRecord, AgentTreeNode } from "../agents/types.js";
import { enrichAgent } from "./agents.js";
import {
  enrichWorkItemExecution,
  executionPhaseLabel,
  type ExecutionPhase,
} from "./pm/execution-status.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { ConversationStore } from "../persistence/conversation-store.js";
import type { MemoryStore } from "../persistence/memory-store.js";
import type { PmStore, WorkItemRecord } from "../persistence/pm-store.js";
import type { SkillStore } from "../persistence/skill-store.js";
import type { Store } from "../persistence/store.js";

export type AgentWorkload = "running" | "queued" | "idle" | "attention";

export type AgentLastActivitySource = "work_item" | "delegation" | "memory" | "conversation";

export interface AgentRosterEntry {
  id: string;
  slug: string;
  name: string;
  responsibilities: string;
  parentId: string | null;
  parentSlug: string | null;
  status: AgentRecord["status"];
  source: AgentRecord["source"];
  skills: string[];
  workload: AgentWorkload;
  activeTasks: number;
  failedTasks: number;
  pendingTasks: number;
  totalTasks: number;
  currentTask?: { title: string; projectSlug: string; phase: string };
  projectSlugs: string[];
  memoryCounts: { logs: number; learnings: number };
  lastActivityAt: string | null;
  lastActivitySource?: AgentLastActivitySource;
}

export interface AgentRosterRollup {
  activeTasks: number;
  failedTasks: number;
  totalTasks: number;
  learnings: number;
  hasActiveChild: boolean;
}

export interface AgentRosterNode {
  agent: AgentRosterEntry;
  children: AgentRosterNode[];
  rollup?: AgentRosterRollup;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function resolveWorkload(
  phases: ExecutionPhase[],
  failedCount: number,
  activeCount: number,
): AgentWorkload {
  if (phases.includes("running")) return "running";
  if (phases.includes("queued")) return "queued";
  if (failedCount > 0) return "attention";
  if (activeCount > 0) return "queued";
  return "idle";
}

function buildAgentMetrics(
  agent: AgentRecord,
  items: WorkItemRecord[],
  projectSlugById: Map<string, string>,
  slugById: Map<string, string>,
  memoryCounts: Map<string, { logs: number; learnings: number }>,
  memoryLatest: Map<string, string>,
  delegationLatest: Map<string, string>,
  conversationLatest: Map<string, string>,
  store: Store,
): AgentRosterEntry {
  const enriched = items.map((item) => enrichWorkItemExecution(item, store));
  const projectSlugs = [
    ...new Set(
      enriched
        .map((item) => projectSlugById.get(item.projectId))
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ];

  let failedTasks = 0;
  let activeTasks = 0;
  let pendingTasks = 0;
  const phases: ExecutionPhase[] = [];
  let currentTask: AgentRosterEntry["currentTask"];

  for (const item of enriched) {
    phases.push(item.executionPhase);
    const isFailed = item.status === "blocked" || item.executionPhase === "failed";
    const isActive =
      item.executionPhase === "queued" ||
      item.executionPhase === "running" ||
      item.status === "in_progress";

    if (isFailed) failedTasks++;
    if (isActive) activeTasks++;
    if (
      !isFailed &&
      item.status !== "done" &&
      item.status !== "cancelled" &&
      !isActive
    ) {
      pendingTasks++;
    }

    if (
      (item.executionPhase === "running" || item.executionPhase === "queued") &&
      !currentTask
    ) {
      currentTask = {
        title: item.title,
        projectSlug: projectSlugById.get(item.projectId) ?? "unknown",
        phase: executionPhaseLabel(item.executionPhase),
      };
    }
  }

  const memoryCount = memoryCounts.get(agent.id) ?? { logs: 0, learnings: 0 };

  let lastActivityAt: string | null = null;
  let lastActivitySource: AgentLastActivitySource | undefined;

  const candidates: Array<[string, AgentLastActivitySource]> = [];
  const latestItem = enriched.reduce<string | null>(
    (max, item) => maxIso(max, item.updatedAt),
    null,
  );
  if (latestItem) candidates.push([latestItem, "work_item"]);

  const delegationAt = delegationLatest.get(agent.id);
  if (delegationAt) candidates.push([delegationAt, "delegation"]);

  const memoryAt = memoryLatest.get(agent.id);
  if (memoryAt) candidates.push([memoryAt, "memory"]);

  const conversationAt = conversationLatest.get(agent.slug);
  if (conversationAt) candidates.push([conversationAt, "conversation"]);

  for (const [at, source] of candidates) {
    if (!lastActivityAt || at > lastActivityAt) {
      lastActivityAt = at;
      lastActivitySource = source;
    }
  }

  const parentSlug = agent.parentId ? slugById.get(agent.parentId) ?? null : null;

  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    responsibilities: agent.responsibilities,
    parentId: agent.parentId,
    parentSlug,
    status: agent.status,
    source: agent.source,
    skills: agent.skills ?? [],
    workload: resolveWorkload(phases, failedTasks, activeTasks),
    activeTasks,
    failedTasks,
    pendingTasks,
    totalTasks: enriched.length,
    currentTask,
    projectSlugs,
    memoryCounts: memoryCount,
    lastActivityAt,
    lastActivitySource,
  };
}

function computeRollup(node: AgentRosterNode): AgentRosterRollup {
  let activeTasks = node.agent.activeTasks;
  let failedTasks = node.agent.failedTasks;
  let totalTasks = node.agent.totalTasks;
  let learnings = node.agent.memoryCounts.learnings;
  let hasActiveChild =
    node.agent.workload === "running" || node.agent.workload === "queued";

  for (const child of node.children) {
    const sub = computeRollup(child);
    activeTasks += sub.activeTasks;
    failedTasks += sub.failedTasks;
    totalTasks += sub.totalTasks;
    learnings += sub.learnings;
    hasActiveChild =
      hasActiveChild ||
      sub.hasActiveChild ||
      child.agent.workload === "running" ||
      child.agent.workload === "queued";
  }

  return { activeTasks, failedTasks, totalTasks, learnings, hasActiveChild };
}

function buildRosterNode(
  node: AgentTreeNode,
  entries: Map<string, AgentRosterEntry>,
): AgentRosterNode {
  const children = node.children.map((child) => buildRosterNode(child, entries));
  const rosterNode: AgentRosterNode = {
    agent: entries.get(node.agent.id)!,
    children,
  };
  if (children.length > 0) {
    rosterNode.rollup = computeRollup(rosterNode);
  }
  return rosterNode;
}

export function getAgentsRoster(
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  skillStore: SkillStore,
  conversationStore: ConversationStore,
  memoryStore?: MemoryStore,
): AgentRosterNode[] {
  const allAgents = agentStore.listAllAgents().map((agent) => enrichAgent(agent, skillStore));
  const slugById = new Map(allAgents.map((agent) => [agent.id, agent.slug]));
  const projectSlugById = new Map(store.listProjects().map((p) => [p.id, p.slug]));

  const itemsByAgent = new Map<string, WorkItemRecord[]>();
  for (const item of pmStore.listAllWorkItems()) {
    if (!item.assigneeAgentId) continue;
    const bucket = itemsByAgent.get(item.assigneeAgentId) ?? [];
    bucket.push(item);
    itemsByAgent.set(item.assigneeAgentId, bucket);
  }

  const memoryCounts = memoryStore?.countAllByAgent() ?? new Map();
  const memoryLatest = memoryStore?.latestCreatedByAgent() ?? new Map();
  const delegationLatest = pmStore.latestDelegationByAgent();
  const conversationLatest = conversationStore.latestByAgentSlug();

  const entries = new Map<string, AgentRosterEntry>();
  for (const agent of allAgents) {
    entries.set(
      agent.id,
      buildAgentMetrics(
        agent,
        itemsByAgent.get(agent.id) ?? [],
        projectSlugById,
        slugById,
        memoryCounts,
        memoryLatest,
        delegationLatest,
        conversationLatest,
        store,
      ),
    );
  }

  const tree = agentStore.buildTree().map((node) => buildRosterNode(node, entries));

  return tree.flatMap((node) => (node.agent.slug === "kampaku" ? node.children : [node]));
}
