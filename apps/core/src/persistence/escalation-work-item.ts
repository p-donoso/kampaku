import type { PmStore, WorkItemRecord, WorkItemStatus } from "./pm-store.js";
import type { JournalStore } from "./journal-store.js";
import { rollupParentWorkItemStatuses } from "../application/pm/work-item-parent-rollup.js";
import { readLatestClosureRefusal } from "../application/pm/closure-refusal.js";

export interface EscalationRecord {
  workItemId?: string;
  workItemStatusBeforePause?: WorkItemStatus;
}

export interface EscalationSource {
  listPending(): EscalationRecord[];
  listAll?(): EscalationRecord[];
}

/** One item an escalation froze, with the status it held before the freeze. */
export interface FrozenWorkItem {
  workItemId: string;
  title: string;
  statusBeforePause: WorkItemStatus;
}

/**
 * Everything an escalation freezes: the item it names, and every item under it.
 *
 * The second half is the point of this function existing separately. `blockWorkItemAndDescendants` wrote
 * `blocked` into the descendants and kept **one** column of memory — the named item's `workItemStatusBeforePause`
 * — so clearing the escalation resumed the named item and left every descendant it froze `blocked`, with no
 * record of its own and nothing that would ever lift it. Measured 2026-10-02 on run `s08r10`: two blockers
 * were raised against the container `8419cdbd`, which froze `02643727` and, under it, `593b665a` and
 * `2edbed14`; the operator cleared both blockers through `kampaku blockers resolve`, `8419cdbd` went back to
 * `todo`, and the two leaves stayed `blocked` with *"no closure decision naming the rule is on record for
 * it"* — the container reading blocked **because of them**, so the chain could not be entered at any point
 * (BOARD F-089).
 */
export function blockWorkItemSubtree(
  pmStore: PmStore,
  workItemId: string,
  projectId: string,
): { statusBeforePause?: WorkItemStatus; frozen: FrozenWorkItem[] } {
  const workItem = pmStore.getWorkItem(workItemId);
  if (!workItem || workItem.status === "blocked") return { frozen: [] };

  const workItemStatusBeforePause = workItem.status;
  pmStore.updateWorkItem(workItem.id, { status: "blocked" });

  const allItems = pmStore.listWorkItemsByProject(projectId);
  const byParent = new Map<string, WorkItemRecord[]>();
  for (const item of allItems) {
    if (item.parentId) {
      const bucket = byParent.get(item.parentId) ?? [];
      bucket.push(item);
      byParent.set(item.parentId, bucket);
    }
  }

  const frozen: FrozenWorkItem[] = [
    { workItemId: workItem.id, title: workItem.title, statusBeforePause: workItemStatusBeforePause },
  ];
  const visit = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      if (child.status !== "blocked" && child.status !== "done") {
        pmStore.updateWorkItem(child.id, { status: "blocked" });
        frozen.push({ workItemId: child.id, title: child.title, statusBeforePause: child.status });
      }
      visit(child.id);
    }
  };
  visit(workItemId);

  return { statusBeforePause: workItemStatusBeforePause, frozen };
}

/**
 * The same freeze, reported the way callers that only need the named item's prior status read it.
 *
 * Kept because two surfaces and their tests ask exactly that question; the durable record of what was frozen
 * is `recordPausedWorkItems`, below.
 */
export function blockWorkItemAndDescendants(
  pmStore: PmStore,
  workItemId: string,
  projectId: string,
): WorkItemStatus | undefined {
  return blockWorkItemSubtree(pmStore, workItemId, projectId).statusBeforePause;
}

/** The journal kind that carries what an escalation froze, so clearing it can thaw the same set. */
export const ESCALATION_PAUSED_ITEMS_KIND = "escalation_paused_items";

/**
 * Records the items an escalation froze, beside the escalation that froze them.
 *
 * In the journal and not in a column, because the shape is a **set** of items per escalation and the tables
 * that hold escalations carry one status each; the journal is already the product's durable record of what
 * happened to a work item, and this is one of those things.
 */
export function recordPausedWorkItems(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  input: {
    workItemId: string;
    projectId?: string;
    /** The escalation that did the freezing: a blocker or a question id. */
    refType: "blocker" | "question";
    refId: string;
    frozen: FrozenWorkItem[];
    occurredAt: string;
  },
): void {
  if (!journalStore || input.frozen.length === 0) return;
  const workItem = pmStore.getWorkItem(input.workItemId);
  const projectId = input.projectId ?? workItem?.projectId;
  if (!projectId) return;
  journalStore.append({
    projectId,
    workItemId: input.workItemId,
    kind: ESCALATION_PAUSED_ITEMS_KIND,
    title: `Paused ${input.frozen.length} work item${input.frozen.length === 1 ? "" : "s"}`,
    body:
      `The ${input.refType} froze ${input.frozen.map((item) => `"${item.title}" (${item.workItemId})`).join(", ")}` +
      `; clearing it resumes each of them to the status it held before.`,
    refType: input.refType,
    refId: input.refId,
    metadata: { frozen: input.frozen },
    occurredAt: input.occurredAt,
  });
}

/** What an escalation froze, read back by its own id. */
export function readPausedWorkItems(
  journalStore: JournalStore | undefined,
  refType: "blocker" | "question",
  refId: string,
): FrozenWorkItem[] {
  if (!journalStore) return [];
  const [entry] = journalStore.listByRef(refType, refId, {
    kinds: [ESCALATION_PAUSED_ITEMS_KIND],
    limit: 1,
  });
  const frozen = entry?.metadata?.frozen;
  if (!Array.isArray(frozen)) return [];
  return frozen.filter(
    (item): item is FrozenWorkItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as FrozenWorkItem).workItemId === "string" &&
      typeof (item as FrozenWorkItem).statusBeforePause === "string",
  );
}

/**
 * Thaws what an escalation froze, once the escalation is clear.
 *
 * Three things are deliberately **not** resumed, because a record written after the freeze wins over the
 * memory of it: an item a second escalation still holds (its own freeze is still in force), an item a closure
 * rule has since refused (that refusal is a real block, and lifting it would hide the rule the operator has to
 * discharge), and an item whose status someone else has already moved off `blocked`.
 */
export function resumePausedWorkItems(
  pmStore: PmStore,
  journalStore: JournalStore | undefined,
  sources: EscalationSource[],
  refType: "blocker" | "question",
  refId: string,
): FrozenWorkItem[] {
  const resumed: FrozenWorkItem[] = [];
  for (const item of readPausedWorkItems(journalStore, refType, refId)) {
    const current = pmStore.getWorkItem(item.workItemId);
    if (!current || current.status !== "blocked") continue;
    if (countPendingEscalationsForWorkItem(sources, item.workItemId) > 0) continue;
    if (readLatestClosureRefusal(journalStore, item.workItemId)) continue;

    const resumeStatus = item.statusBeforePause === "in_progress" ? "todo" : item.statusBeforePause;
    pmStore.updateWorkItem(item.workItemId, {
      status: resumeStatus,
      ...(resumeStatus === "todo" ? { goalId: undefined, jobId: undefined } : {}),
    });
    rollupParentWorkItemStatuses(pmStore, item.workItemId);
    resumed.push({ ...item, statusBeforePause: resumeStatus });
  }
  return resumed;
}

export function countPendingEscalationsForWorkItem(
  sources: EscalationSource[],
  workItemId: string,
): number {
  let count = 0;
  for (const source of sources) {
    count += source.listPending().filter((record) => record.workItemId === workItemId).length;
  }
  return count;
}

export function findWorkItemStatusBeforePause(
  sources: EscalationSource[],
  workItemId: string,
): WorkItemStatus | undefined {
  for (const source of sources) {
    const fromPending = source
      .listPending()
      .find((record) => record.workItemId === workItemId && record.workItemStatusBeforePause);
    if (fromPending?.workItemStatusBeforePause) return fromPending.workItemStatusBeforePause;

    const fromAll = source.listAll?.().find(
      (record) => record.workItemId === workItemId && record.workItemStatusBeforePause,
    );
    if (fromAll?.workItemStatusBeforePause) return fromAll.workItemStatusBeforePause;
  }
  return undefined;
}

export function resumeWorkItemIfClear(
  pmStore: PmStore,
  sources: EscalationSource[],
  workItemId: string | undefined,
  fallback?: WorkItemStatus,
): void {
  if (!workItemId) return;
  if (countPendingEscalationsForWorkItem(sources, workItemId) > 0) return;

  const workItem = pmStore.getWorkItem(workItemId);
  if (!workItem || workItem.status !== "blocked") return;

  const original = fallback ?? findWorkItemStatusBeforePause(sources, workItemId) ?? "todo";
  const resumeStatus = original === "in_progress" ? "todo" : original;
  pmStore.updateWorkItem(workItemId, {
    status: resumeStatus,
    ...(resumeStatus === "todo" ? { goalId: undefined, jobId: undefined } : {}),
  });

  if (resumeStatus === "todo") {
    rollupParentWorkItemStatuses(pmStore, workItemId);
  }
}
