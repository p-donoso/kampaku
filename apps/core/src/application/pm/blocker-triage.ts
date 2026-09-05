import type { AppConfig } from "../../config.js";
import { runSubAgentSession } from "../../agents/runtime/sub-agent-session.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore, AgentBlockageRecord } from "../../persistence/blockage-store.js";
import type { ConversationStore } from "../../persistence/conversation-store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { SkillStore } from "../../persistence/skill-store.js";
import type { Store } from "../../persistence/store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import { v4 as uuidv4 } from "uuid";
import { ExecuteWorkItemError, type ExecuteWorkItemResult } from "./execute-work-item.js";

export const BLOCKER_TRIAGE_ROUTING_PREFIX = "blocker_triage:";

export function buildBlockerTriageRoutingReason(blockerId: string): string {
  return `${BLOCKER_TRIAGE_ROUTING_PREFIX}${blockerId}`;
}

export function parseBlockerTriageRoutingReason(
  routingReason?: string,
): { blockerId: string } | null {
  if (!routingReason?.startsWith(BLOCKER_TRIAGE_ROUTING_PREFIX)) return null;
  const blockerId = routingReason.slice(BLOCKER_TRIAGE_ROUTING_PREFIX.length).trim();
  return blockerId ? { blockerId } : null;
}

export function isBlockerTriageWorkItem(item: WorkItemRecord): boolean {
  return parseBlockerTriageRoutingReason(item.routingReason) !== null;
}

export function findTriageWorkItemForBlocker(
  pmStore: PmStore,
  projectId: string,
  blockerId: string,
): WorkItemRecord | undefined {
  return pmStore
    .listWorkItemsByProject(projectId)
    .find((item) => parseBlockerTriageRoutingReason(item.routingReason)?.blockerId === blockerId);
}

function buildTriageObjective(
  blocker: AgentBlockageRecord,
  blockedWorkItem: WorkItemRecord | undefined,
  reporterSlug: string,
): string {
  const lines = [
    "Triage a pending blocker reported by a subordinate before their blocked task can retry.",
    "",
    `blocker_id: ${blocker.id}`,
    `Reporter agent slug: ${reporterSlug}`,
    `Blocker description: ${blocker.description}`,
  ];
  if (blockedWorkItem) {
    lines.push(`Blocked work item id: ${blockedWorkItem.id}`);
    lines.push(`Blocked task title: ${blockedWorkItem.title}`);
    if (blockedWorkItem.description?.trim()) {
      lines.push(`Blocked task description: ${blockedWorkItem.description.trim()}`);
    }
    if (blockedWorkItem.acceptanceCriteria.length > 0) {
      lines.push("Blocked task acceptance criteria:");
      for (const criterion of blockedWorkItem.acceptanceCriteria) {
        lines.push(`- ${criterion}`);
      }
    }
  }
  if (blocker.context?.trim()) {
    lines.push("", "Failure context:", blocker.context.trim());
  }
  lines.push(
    "",
    "Required actions (pick one path):",
    "- resolve_blocker with clear instructions when the original assignee can retry safely.",
    "- delegate_blocker to split prerequisite work to another agent when scope must change.",
    "- convert_blocker_to_question when the emperor must decide.",
    "- escalate_blocker upward only when you cannot decide.",
    "Do not retry the blocked coding task yourself; coordinate via blocker tools.",
  );
  return lines.join("\n");
}

export function ensureBlockerTriageWorkItem(
  pmStore: PmStore,
  agentStore: AgentStore,
  blockageStore: BlockageStore,
  blocker: AgentBlockageRecord,
): WorkItemRecord | undefined {
  if (!blocker.projectId) return undefined;

  const existing = findTriageWorkItemForBlocker(pmStore, blocker.projectId, blocker.id);
  if (existing) return existing;

  const blockedWorkItem = blocker.workItemId
    ? pmStore.getWorkItem(blocker.workItemId)
    : undefined;
  const reporter = agentStore.getAgentBySlugOrId(blocker.reportedByAgentId);
  const now = new Date().toISOString();
  const title = blockedWorkItem
    ? `Triage blocker — ${blockedWorkItem.title}`
    : "Triage blocker";

  return pmStore.createWorkItem({
    id: uuidv4(),
    projectId: blocker.projectId,
    parentId: blockedWorkItem?.parentId,
    title,
    description: buildTriageObjective(blocker, blockedWorkItem, reporter?.slug ?? blocker.reportedByAgentId),
    status: "todo",
    priority: 100,
    sortOrder: -1,
    assigneeAgentId: blocker.recipientAgentId,
    acceptanceCriteria: [
      "Resolve, delegate, convert, or escalate the linked blocker using blocker workflow tools.",
    ],
    dependsOn: [],
    routingReason: buildBlockerTriageRoutingReason(blocker.id),
    createdAt: now,
    updatedAt: now,
  });
}

export function ensureBlockerTriageForPendingBlockers(
  pmStore: PmStore,
  agentStore: AgentStore,
  blockageStore: BlockageStore,
  projectId: string,
): void {
  for (const blocker of blockageStore.listPending()) {
    if (blocker.projectId !== projectId) continue;
    ensureBlockerTriageWorkItem(pmStore, agentStore, blockageStore, blocker);
  }
}

export function completeBlockerTriageWorkItem(pmStore: PmStore, blockerId: string): void {
  for (const item of pmStore.listAllWorkItems()) {
    if (parseBlockerTriageRoutingReason(item.routingReason)?.blockerId !== blockerId) continue;
    if (item.status === "done" || item.status === "cancelled") continue;
    pmStore.updateWorkItem(item.id, { status: "done" });
  }
}

export function reassignBlockerTriageWorkItem(
  pmStore: PmStore,
  blockerId: string,
  assigneeAgentId: string,
): void {
  for (const item of pmStore.listAllWorkItems()) {
    if (parseBlockerTriageRoutingReason(item.routingReason)?.blockerId !== blockerId) continue;
    if (item.status === "done" || item.status === "cancelled") continue;
    pmStore.updateWorkItem(item.id, { assigneeAgentId, status: "todo" });
  }
}

export function findNextBlockerTriageWorkItem(
  pmStore: PmStore,
  blockageStore: BlockageStore | undefined,
  projectId: string,
): WorkItemRecord | null {
  if (!blockageStore) return null;

  const pendingBlockerIds = new Set(
    blockageStore
      .listPending()
      .filter((blocker) => blocker.projectId === projectId)
      .map((blocker) => blocker.id),
  );
  if (pendingBlockerIds.size === 0) return null;

  const candidates = pmStore
    .listWorkItemsByProject(projectId)
    .filter((item) => {
      const parsed = parseBlockerTriageRoutingReason(item.routingReason);
      if (!parsed || !pendingBlockerIds.has(parsed.blockerId)) return false;
      return item.status === "todo";
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return candidates[0] ?? null;
}

export function hasPendingBlockerForWorkItem(
  blockageStore: BlockageStore | undefined,
  workItemId: string,
): boolean {
  if (!blockageStore) return false;
  return blockageStore.listPending().some((blocker) => blocker.workItemId === workItemId);
}

export interface BlockerTriageContext {
  store: Store;
  pmStore: PmStore;
  agentStore: AgentStore;
  skillStore: SkillStore;
  config: AppConfig;
  conversationStore: ConversationStore;
  memoryStore: MemoryStore;
  questionStore?: QuestionStore;
  blockageStore?: BlockageStore;
  journalStore?: JournalStore;
}

export async function executeBlockerTriageWorkItem(
  ctx: BlockerTriageContext,
  workItemId: string,
): Promise<ExecuteWorkItemResult> {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) {
    throw new ExecuteWorkItemError("Work item not found.", "NOT_FOUND");
  }

  const parsed = parseBlockerTriageRoutingReason(workItem.routingReason);
  if (!parsed) {
    throw new ExecuteWorkItemError("Work item is not a blocker triage task.", "VALIDATION");
  }

  if (!ctx.blockageStore) {
    throw new ExecuteWorkItemError("Blocker workflow is not available.", "VALIDATION");
  }

  const blocker = ctx.blockageStore.get(parsed.blockerId);
  if (!blocker || blocker.status !== "pending") {
    ctx.pmStore.updateWorkItem(workItemId, { status: "done" });
    throw new ExecuteWorkItemError("Linked blocker is no longer pending.", "CONFLICT");
  }

  if (!workItem.assigneeAgentId) {
    throw new ExecuteWorkItemError("Blocker triage task has no assignee.", "VALIDATION");
  }

  const assignee = ctx.agentStore.getAgentBySlugOrId(workItem.assigneeAgentId);
  if (!assignee) {
    throw new ExecuteWorkItemError("Blocker triage assignee not found.", "NOT_FOUND");
  }

  ctx.pmStore.updateWorkItem(workItemId, { status: "in_progress" });

  const objective = buildTriageObjective(
    blocker,
    blocker.workItemId ? ctx.pmStore.getWorkItem(blocker.workItemId) : undefined,
    ctx.agentStore.getAgentBySlugOrId(blocker.reportedByAgentId)?.slug ?? blocker.reportedByAgentId,
  );

  // Kampaku (and any agent without autonomous tools) cannot run sub-agent sessions.
  // Auto-resolve with retry instructions so play is not permanently gated.
  const triageTools = ctx.skillStore?.getAgentToolNames(assignee.id) ?? [];
  if (assignee.slug === "kampaku" || triageTools.length === 0) {
    ctx.blockageStore.resolve(
      parsed.blockerId,
      "Auto-resolved: recipient cannot run autonomous triage. Retry the blocked leaf after fixing verification failures (install/build/test) in the linked repository.",
      assignee.id,
      "resolved",
    );
    ctx.pmStore.updateWorkItem(workItemId, { status: "done" });
    return {
      workItemId,
      objective,
      repositoryRole: "web",
    };
  }

  await runSubAgentSession(
    {
      agentStore: ctx.agentStore,
      conversationStore: ctx.conversationStore,
      store: ctx.store,
      pmStore: ctx.pmStore,
      skillStore: ctx.skillStore,
      config: ctx.config,
      questionStore: ctx.questionStore,
      blockageStore: ctx.blockageStore,
      journalStore: ctx.journalStore,
      memoryStore: ctx.memoryStore,
    },
    assignee,
    objective,
    workItem.projectId,
  );

  const stillPending = ctx.blockageStore.get(parsed.blockerId)?.status === "pending";
  if (stillPending) {
    ctx.pmStore.updateWorkItem(workItemId, { status: "todo" });
    throw new ExecuteWorkItemError(
      "Blocker triage finished without resolving the pending blocker.",
      "CONFLICT",
    );
  }

  ctx.pmStore.updateWorkItem(workItemId, { status: "done" });

  return {
    workItemId,
    objective,
    repositoryRole: "web",
  };
}
