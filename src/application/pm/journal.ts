import type { AgentStore } from "../../persistence/agent-store.js";
import type { JournalEntryKind, JournalStore, WorkItemJournalEntryRecord } from "../../persistence/journal-store.js";
import type { PmStore } from "../../persistence/pm-store.js";

export interface EnrichedJournalEntry {
  id: string;
  kind: JournalEntryKind;
  title: string;
  body: string;
  occurredAt: string;
  workItem: { id: string; title: string };
  anchorWorkItemId: string;
  fromAgent?: { id: string; slug: string; name: string };
  toAgent?: { id: string; slug: string; name: string };
  refType?: string;
  refId?: string;
  metadata: Record<string, unknown>;
}

function agentRef(
  agentStore: AgentStore,
  agentId: string | undefined,
): EnrichedJournalEntry["fromAgent"] {
  if (!agentId) return undefined;
  const agent = agentStore.getAgentBySlugOrId(agentId);
  if (!agent) return { id: agentId, slug: agentId, name: agentId };
  return { id: agent.id, slug: agent.slug, name: agent.name };
}

export function enrichJournalEntries(
  entries: WorkItemJournalEntryRecord[],
  pmStore: PmStore,
  agentStore: AgentStore,
): EnrichedJournalEntry[] {
  return entries.map((entry) => {
    const workItem = pmStore.getWorkItem(entry.workItemId);
    return {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      occurredAt: entry.occurredAt,
      workItem: {
        id: entry.workItemId,
        title: workItem?.title ?? entry.workItemId,
      },
      anchorWorkItemId: entry.anchorWorkItemId,
      fromAgent: agentRef(agentStore, entry.fromAgentId),
      toAgent: agentRef(agentStore, entry.toAgentId),
      refType: entry.refType,
      refId: entry.refId,
      metadata: entry.metadata,
    };
  });
}

export function listProjectJournal(
  journalStore: JournalStore,
  pmStore: PmStore,
  agentStore: AgentStore,
  projectId: string,
  filters: { workItemId?: string; kinds?: JournalEntryKind[]; limit?: number; before?: string },
): EnrichedJournalEntry[] {
  const entries = journalStore.listByProject(projectId, filters);
  return enrichJournalEntries(entries, pmStore, agentStore);
}

export function listWorkItemJournal(
  journalStore: JournalStore,
  pmStore: PmStore,
  agentStore: AgentStore,
  workItemId: string,
  filters: { kinds?: JournalEntryKind[]; limit?: number; before?: string } = {},
): EnrichedJournalEntry[] {
  const entries = journalStore.listForWorkItem(workItemId, filters);
  return enrichJournalEntries(entries, pmStore, agentStore);
}

export function parseJournalKinds(raw: string | undefined): JournalEntryKind[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw.split(",").map((kind) => kind.trim()) as JournalEntryKind[];
}
