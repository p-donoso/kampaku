import { v4 as uuidv4 } from "uuid";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";
import {
  extractImpliedFilePaths,
  extractImpliedNpmScripts,
} from "../../delegator/plan-validation.js";

export const LEAF_SPLIT_ROUTING_PREFIX = "leaf_split:";

export function buildLeafSplitRoutingReason(workItemId: string): string {
  return `${LEAF_SPLIT_ROUTING_PREFIX}${workItemId}`;
}

export function parseLeafSplitRoutingReason(routingReason?: string): { workItemId: string } | null {
  if (!routingReason?.startsWith(LEAF_SPLIT_ROUTING_PREFIX)) return null;
  const workItemId = routingReason.slice(LEAF_SPLIT_ROUTING_PREFIX.length).trim();
  return workItemId ? { workItemId } : null;
}

export function isLeafSplitWorkItem(item: WorkItemRecord): boolean {
  return parseLeafSplitRoutingReason(item.routingReason) !== null;
}

export function workItemObjectiveBlob(item: WorkItemRecord): string {
  return [item.title, item.description ?? "", ...(item.acceptanceCriteria ?? [])].join("\n");
}

export function isOverweightLeaf(item: WorkItemRecord): boolean {
  const blob = workItemObjectiveBlob(item);
  return extractImpliedFilePaths(blob).length > 3 || extractImpliedNpmScripts(blob).length > 2;
}

function resolveLeadAgentId(store: Store, agentStore: AgentStore, projectId: string): string | undefined {
  const project = store.getProject(projectId);
  if (project?.projectLeadAgentId) return project.projectLeadAgentId;
  if (project?.slug) {
    const lead = agentStore.getAgentBySlugOrId(`${project.slug}-lead`);
    if (lead) return lead.id;
  }
  return agentStore.getKampakuAgent()?.id;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups.length > 0 ? groups : [[]];
}

export function applyDeterministicLeafSplit(
  pmStore: PmStore,
  original: WorkItemRecord,
): WorkItemRecord[] {
  const blob = workItemObjectiveBlob(original);
  const files = extractImpliedFilePaths(blob);
  const scripts = extractImpliedNpmScripts(blob);
  const now = new Date().toISOString();
  const created: WorkItemRecord[] = [];

  const fileGroups = files.length > 0 ? chunk(files, 3) : [[undefined]];
  const scriptGroups = scripts.length > 2 ? chunk(scripts, 2) : [scripts];
  const parts = Math.max(fileGroups.length, scriptGroups.length, 2);

  for (let index = 0; index < parts; index += 1) {
    const fileGroup = fileGroups[index] ?? fileGroups[0] ?? [];
    const scriptGroup = scriptGroups[index] ?? scriptGroups[0] ?? [];
    const fileHint = fileGroup.filter((path): path is string => Boolean(path));
    const title = `${original.title} — slice ${index + 1}`;
    const description = [
      `Split from overweight leaf "${original.title}".`,
      fileHint.length > 0
        ? `Touch only: ${fileHint.join(", ")}. Do not edit sibling slice files.`
        : "Keep this slice to one concern and at most three files.",
      "Follow repository conventions. Record command stdout in the completion report before closure.",
    ].join(" ");
    const acceptanceCriteria = [
      ...(scriptGroup.length > 0
        ? scriptGroup.map((script) => `npm run ${script} succeeds`)
        : ["npm test succeeds when package.json defines a test script"]),
      ...(fileHint.length > 0
        ? fileHint.slice(0, 1).map((path) => `file exists at ${path}`)
        : ["file exists at the primary path named in the description"]),
    ];
    created.push(
      pmStore.createWorkItem({
        id: uuidv4(),
        projectId: original.projectId,
        parentId: original.id,
        title,
        description,
        status: "todo",
        priority: original.priority,
        sortOrder: index,
        assigneeAgentId: original.assigneeAgentId,
        assignedByAgentId: original.assignedByAgentId,
        acceptanceCriteria,
        dependsOn: [],
        routingReason: `split_of:${original.id}`,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  return created;
}

export function ensureLeafSplitWorkItem(
  pmStore: PmStore,
  agentStore: AgentStore,
  store: Store,
  overweight: WorkItemRecord,
): WorkItemRecord {
  const existing = pmStore
    .listWorkItemsByProject(overweight.projectId)
    .find((item) => parseLeafSplitRoutingReason(item.routingReason)?.workItemId === overweight.id);
  if (existing) return existing;

  const children = pmStore
    .listWorkItemsByProject(overweight.projectId)
    .filter((item) => item.parentId === overweight.id);
  if (children.length > 0) return overweight;

  const leadId = resolveLeadAgentId(store, agentStore, overweight.projectId);
  const now = new Date().toISOString();
  const splitItem = pmStore.createWorkItem({
    id: uuidv4(),
    projectId: overweight.projectId,
    parentId: overweight.parentId,
    title: `Split overweight task — ${overweight.title}`,
    description: [
      `The leaf "${overweight.title}" implies more than 3 files or more than 2 npm scripts.`,
      "Split it into one-concern children (max 3 files and 2 scripts each) before a worker job starts.",
    ].join(" "),
    status: "todo",
    priority: 100,
    sortOrder: Math.min(overweight.sortOrder, 0) - 1,
    assigneeAgentId: leadId,
    acceptanceCriteria: [
      "Overweight leaf is converted into child micro-tasks with verifiable AC",
    ],
    dependsOn: [],
    routingReason: buildLeafSplitRoutingReason(overweight.id),
    createdAt: now,
    updatedAt: now,
  });

  applyDeterministicLeafSplit(pmStore, overweight);
  pmStore.updateWorkItem(splitItem.id, { status: "done" });
  return splitItem;
}

export function findNextLeafSplitWorkItem(pmStore: PmStore, projectId: string): WorkItemRecord | null {
  const pending = pmStore
    .listWorkItemsByProject(projectId)
    .filter((item) => isLeafSplitWorkItem(item) && item.status === "todo")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return pending[0] ?? null;
}
