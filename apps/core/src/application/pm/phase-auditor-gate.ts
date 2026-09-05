import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";
import { inferRequiredChecksFromWorkItem } from "./work-item-checks.js";
import { recordPhaseGateJournal } from "./journal-events.js";

export const PHASE_GATE_ROUTING_PREFIX = "phase_gate:";
export const SENSEI_AUDIT_RELATIVE_PATH = "docs/audit/latest.md";

export function buildPhaseGateRoutingReason(phaseWorkItemId: string): string {
  return `${PHASE_GATE_ROUTING_PREFIX}${phaseWorkItemId}`;
}

export function parsePhaseGateRoutingReason(routingReason?: string): { phaseWorkItemId: string } | null {
  if (!routingReason?.startsWith(PHASE_GATE_ROUTING_PREFIX)) return null;
  const phaseWorkItemId = routingReason.slice(PHASE_GATE_ROUTING_PREFIX.length).trim();
  return phaseWorkItemId ? { phaseWorkItemId } : null;
}

export function isPhaseGateWorkItem(item: WorkItemRecord): boolean {
  return parsePhaseGateRoutingReason(item.routingReason) !== null;
}

export function isRootPhaseContainer(item: WorkItemRecord, pmStore: PmStore): boolean {
  if (item.parentId) return false;
  return pmStore.listWorkItemsByProject(item.projectId).some((child) => child.parentId === item.id);
}

export function findPhaseGateWorkItem(
  pmStore: PmStore,
  projectId: string,
  phaseWorkItemId: string,
): WorkItemRecord | undefined {
  return pmStore
    .listWorkItemsByProject(projectId)
    .find((item) => parsePhaseGateRoutingReason(item.routingReason)?.phaseWorkItemId === phaseWorkItemId);
}

export function findNextPhaseGateWorkItem(pmStore: PmStore, projectId: string): WorkItemRecord | null {
  const candidates = pmStore
    .listWorkItemsByProject(projectId)
    .filter((item) => isPhaseGateWorkItem(item) && (item.status === "todo" || item.status === "in_progress"))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return candidates[0] ?? null;
}

function sampleDoneLeaf(leaves: WorkItemRecord[], seed: string): WorkItemRecord | undefined {
  const done = leaves.filter((leaf) => leaf.status === "done" && !isPhaseGateWorkItem(leaf));
  if (done.length === 0) return undefined;
  const index = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % done.length;
  return done[index];
}

function resolveAuditorAgentId(agentStore: AgentStore, projectSlug?: string): string | undefined {
  const slugs = [
    projectSlug ? `${projectSlug}-auditor` : undefined,
    "kampaku-auditor",
  ].filter((slug): slug is string => Boolean(slug));
  for (const slug of slugs) {
    const agent = agentStore.getAgentBySlugOrId(slug);
    if (agent) return agent.id;
  }
  return agentStore.listAllAgents().find((agent) => agent.slug.endsWith("-auditor"))?.id;
}

export function isStubAuditText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 400) return true;
  if (/["']status["']\s*:\s*["']ready["']/i.test(trimmed) && !/verdict|score/i.test(trimmed)) {
    return true;
  }
  if (!/verdict/i.test(trimmed) || !/score/i.test(trimmed)) return true;
  return false;
}

export function auditArtifactIsHonest(input: {
  repositoryPath?: string;
  summary?: string;
}): boolean {
  if (input.repositoryPath) {
    const auditPath = join(input.repositoryPath, SENSEI_AUDIT_RELATIVE_PATH);
    if (existsSync(auditPath)) {
      try {
        return !isStubAuditText(readFileSync(auditPath, "utf8"));
      } catch {
        return false;
      }
    }
  }
  if (input.summary) return !isStubAuditText(input.summary);
  return false;
}

export function ensurePhaseAuditorWorkItem(
  pmStore: PmStore,
  agentStore: AgentStore,
  store: Store,
  phase: WorkItemRecord,
  journalStore?: JournalStore,
): WorkItemRecord | undefined {
  const existing = findPhaseGateWorkItem(pmStore, phase.projectId, phase.id);
  if (existing) return existing;

  const project = store.getProject(phase.projectId);
  const children = pmStore
    .listWorkItemsByProject(phase.projectId)
    .filter((item) => item.parentId === phase.id && !isPhaseGateWorkItem(item));
  const unfinished = children.filter((item) => item.status !== "done" && item.status !== "cancelled");
  if (unfinished.length > 0) return undefined;

  const auditorId = resolveAuditorAgentId(agentStore, project?.slug);
  if (!auditorId) return undefined;

  const sampled = sampleDoneLeaf(children, phase.id);
  const sampledChecks = sampled ? inferRequiredChecksFromWorkItem(sampled) : [];
  const now = new Date().toISOString();
  const maxSort = children.reduce((max, item) => Math.max(max, item.sortOrder), 0);

  const created = pmStore.createWorkItem({
    id: uuidv4(),
    projectId: phase.projectId,
    parentId: phase.id,
    title: `Audit phase — ${phase.title}`,
    description: [
      `Hard phase gate for "${phase.title}". Do not mark this phase done until a sensei-grade audit artifact exists.`,
      `Write ${SENSEI_AUDIT_RELATIVE_PATH} using the deliverable-readiness rubric (verdict, dimension scores, findings with file evidence).`,
      "Do not emit a stub JSON such as {\"status\":\"ready\"}.",
      sampled
        ? `Sampled leaf AC re-run: "${sampled.title}"${sampledChecks.length > 0 ? ` — run ${sampledChecks.map((script) => `npm run ${script}`).join(" and ")} and record stdout.` : "."}`
        : "Sample one completed leaf and re-run its acceptance commands.",
      "If the gate fails, reopen affected tasks; do not advance to the next track.",
    ].join(" "),
    status: "todo",
    priority: 0,
    sortOrder: maxSort + 10,
    assigneeAgentId: auditorId,
    acceptanceCriteria: [
      `file exists at ${SENSEI_AUDIT_RELATIVE_PATH}`,
      "docs/audit/latest.md includes Verdict and score with evidence",
      "npm test passes when package.json defines a test script",
    ],
    dependsOn: children.map((item) => item.title),
    routingReason: buildPhaseGateRoutingReason(phase.id),
    createdAt: now,
    updatedAt: now,
  });

  if (journalStore) {
    recordPhaseGateJournal(journalStore, pmStore, {
      projectId: phase.projectId,
      phaseWorkItemId: phase.id,
      phaseTitle: phase.title,
    });
  }

  return created;
}

export function ensurePhaseAuditorAfterLeafDone(
  pmStore: PmStore,
  agentStore: AgentStore | undefined,
  store: Store | undefined,
  completedLeafId: string,
  journalStore?: JournalStore,
): WorkItemRecord | undefined {
  if (!agentStore || !store) return undefined;
  const leaf = pmStore.getWorkItem(completedLeafId);
  if (!leaf?.parentId) return undefined;

  let current = pmStore.getWorkItem(leaf.parentId);
  while (current) {
    if (isRootPhaseContainer(current, pmStore)) {
      return ensurePhaseAuditorWorkItem(pmStore, agentStore, store, current, journalStore);
    }
    current = current.parentId ? pmStore.getWorkItem(current.parentId) : undefined;
  }
  return undefined;
}
