import type { PmStore, WorkItemRecord, WorkItemTreeNode } from "../../persistence/pm-store.js";
import { findNextBlockerTriageWorkItem, isBlockerTriageWorkItem } from "./blocker-triage.js";
import { findNextPhaseGateWorkItem, isPhaseGateWorkItem } from "./phase-auditor-gate.js";
import { findNextLeafSplitWorkItem, isLeafSplitWorkItem } from "./leaf-splitter.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import {
  describeClosureRefusal,
  describeUnrecordedBlock,
  readLatestClosureRefusal,
} from "./closure-refusal.js";
import { explainBlockedWorkItem } from "./blocked-item-explanation.js";
import { derivedWorkItemStatuses, ownBlockWorkItemIds, type DerivedWorkItemStatus } from "./work-item-status-rollup.js";

/**
 * Whether this item's *kind* is the reason it exists — an item whose job is to clear what is above it.
 *
 * Triage, split and phase-gate items are born inside containers that are already blocked (a blocker was
 * raised on the container, so the platform froze the whole subtree), and the product documents them as
 * releasable there. The gate must therefore refuse them for something about **themselves**, never for the
 * container they were created under.
 */
export function isReleasableUnderBlockedContainer(item: WorkItemRecord): boolean {
  return isBlockerTriageWorkItem(item) || isLeafSplitWorkItem(item) || isPhaseGateWorkItem(item);
}

/**
 * The records a release decision reads to explain itself: the journal that holds closure refusals, and the
 * stores that hold the escalations a block can be instead.
 *
 * Passed as one object rather than one parameter per store, because they are one question — *what is this
 * item blocked by?* — and because a gate that is handed the journal but not the blockage store can only
 * answer half of it (measured: `execute_work_item` on run `s08r10` was refused by a container whose own
 * child held a readable refusal, and the sentence named the container's block but never the rule).
 */
export interface CanExecuteReadContext {
  journalStore?: JournalStore;
  blockageStore?: BlockageStore;
  questionStore?: QuestionStore;
  agentStore?: AgentStore;
}

export function collectLeavesInOrder(nodes: WorkItemTreeNode[]): WorkItemRecord[] {
  const result: WorkItemRecord[] = [];
  for (const node of nodes) {
    if (node.children.length === 0) {
      result.push(node.item);
    } else {
      result.push(...collectLeavesInOrder(node.children));
    }
  }
  return result;
}


/**
 * Whether every dependency of a leaf is done.
 *
 * **Keyed by id, and title only as a fallback.** This used to compare titles and nothing else, so the
 * dependency graph the plan hands a human was keyed to a string a later edit can change: retitling one leaf
 * silently detached everything downstream of it, and two leaves sharing a title made the edge ambiguous.
 * Measured 2026-09-29 in suite 07 run 18's store — W2's `dependsOn_json` reads
 * `["W1 — Add word-statistics aggregation API with unit tests"]` — while the suite's own oracle asks for
 * **stable ids** (BOARD F-069).
 *
 * Ids are written where they can be: `plan-and-delegate` resolves a plan's `depends_on` (which the planner
 * authors as titles, because that is what a model can name while writing a plan) to the ids it just assigned.
 * A title is still accepted for records written before this change and for edges a caller passes through
 * unresolved — a dependency that cannot be satisfied is a *stall*, and a stall is worse than a fallback. What
 * changed is which of the two is preferred, not whether the other works.
 * A dependency that is **cancelled** is settled too, and this is the measured half. `dependsOnSatisfied` counted
 * only `done`, so an edge to a cancelled item could never be satisfied — and one is created routinely: a triage
 * leaf raised for a blocker is *cancelled* when the blocker is cleared, and a phase audit gate created afterwards
 * lists every child, cancelled ones included. Measured 2026-11-23 on suite 19 run `s19r22`: the Phase 1 audit gate
 * `dacd70d8` carried `dependsOn: ["Reproduce both check failures…", "Triage blocker — Reproduce both check
 * failures…"]`, the second is `cancelled`, and `kampaku projects play` refused forever with *"Phase siblings must be
 * completed before the auditor gate."* — a phase that had done its work could never be audited, and the line behind
 * it never moved. It is the same sentence the rollup already applies (BOARD F-142): a child that will not be done
 * because it is not needed is not outstanding work.
 */
export function dependsOnSatisfied(leaf: WorkItemRecord, items: WorkItemRecord[]): boolean {
  if (leaf.dependsOn.length === 0) return true;
  const settled = new Set(
    items
      .filter((item) => item.status === "done" || item.status === "cancelled")
      .flatMap((item) => [item.id, item.title]),
  );
  return leaf.dependsOn.every((dep) => settled.has(dep));
}

/**
 * A plan's dependency references, resolved to the work-item ids they now name.
 *
 * `alreadyAssigned` is the map built as the plan is written, and it is also the **scope** of the resolution:
 * a reference that matches no step in this plan is kept verbatim rather than dropped, so the edge still shows
 * up as an unsatisfied dependency the auditor can see instead of vanishing into a satisfied one.
 */
export function resolveDependencyReferences(
  references: string[],
  alreadyAssigned: ReadonlyMap<string, string>,
): string[] {
  return references.map((reference) => {
    const trimmed = reference.trim();
    if (!trimmed) return trimmed;
    return alreadyAssigned.get(trimmed.toLowerCase()) ?? trimmed;
  });
}

export function predecessorsComplete(
  leaf: WorkItemRecord,
  orderedLeaves: WorkItemRecord[],
): boolean {
  const index = orderedLeaves.findIndex((item) => item.id === leaf.id);
  if (index <= 0) return true;
  for (let i = 0; i < index; i++) {
    const status = orderedLeaves[i].status;
    if (status !== "done" && status !== "cancelled") return false;
  }
  return true;
}

export function canExecuteLeaf(
  leaf: WorkItemRecord,
  orderedLeaves: WorkItemRecord[],
  items: WorkItemRecord[],
  pmStore: PmStore,
  // Appended, never inserted: positional parameter list. The journal is where a closure refusal is
  // recorded, and without it a `blocked` leaf can only be reported as blocked (BOARD F-088); the escalations
  // are the other half of the same question (BOARD F-089).
  read: CanExecuteReadContext = {},
): { ok: true } | { ok: false; reason: string } {
  if (leaf.status === "done" || leaf.status === "cancelled") {
    return { ok: false, reason: "Task is already finished." };
  }

  if (leaf.status === "in_progress") {
    return { ok: false, reason: "Task is already executing." };
  }

  // The statuses the read surfaces render, and the sentence for whatever carries the block. Both come from
  // the shared derivation, so a gate that refuses and a tree that reports cannot name different items
  // (BOARD F-089).
  const derived = derivedWorkItemStatuses(
    pmStore,
    leaf.projectId,
    new Set(),
    ownBlockWorkItemIds(read.journalStore, leaf.projectId),
  );
  const explanationCtx = { pmStore, ...read };
  const inheritedBlock = inheritedBlockOf(leaf, derived, pmStore);

  if (leaf.status === "blocked") {
    const refusal = readLatestClosureRefusal(read.journalStore, leaf.id);
    // A block with nothing about this item behind it, carried by its container, is the **container's**
    // block. For a triage, split or phase-gate item that is the documented escape hatch — those kinds exist
    // to clear a container — and for anything else the sentence has to name the container rather than a rule
    // this item never had.
    if (!refusal && inheritedBlock) {
      if (isReleasableUnderBlockedContainer(leaf)) return { ok: true };
      return {
        ok: false,
        reason: explainBlockedWorkItem(explanationCtx, leaf, leaf.projectId, { derived }).detail,
      };
    }
    // The rule that refused, the field it read and the command that clears it — never a list of possible
    // causes. The sentence this replaces — *"Task is blocked by an error, pending question, or blocker."* —
    // named three causes and all three were empty on the measured specimen (BOARD F-088).
    return {
      ok: false,
      reason: refusal ? describeClosureRefusal(refusal) : describeUnrecordedBlock(leaf, leaf.projectId),
    };
  }

  if (isBlockerTriageWorkItem(leaf) || isLeafSplitWorkItem(leaf)) {
    return { ok: true };
  }

  if (isPhaseGateWorkItem(leaf)) {
    if (!dependsOnSatisfied(leaf, items)) {
      return { ok: false, reason: "Phase siblings must be completed before the auditor gate." };
    }
    return { ok: true };
  }

  if (inheritedBlock) {
    // The container's own sentence, which names what the container waits on and the command that clears it —
    // not a paraphrase of the container's stored column. A container blocked because a child is blocked
    // cannot clear itself, and telling the operator it "is blocked" without saying what it waits on is how
    // run `s08r10` stopped with three items that never released (BOARD F-089).
    return {
      ok: false,
      reason: `Parent "${inheritedBlock.title}" (${inheritedBlock.id.slice(0, 8)}) is blocked — ${
        explainBlockedWorkItem(explanationCtx, inheritedBlock, leaf.projectId, { derived }).detail
      }`,
    };
  }

  if (!predecessorsComplete(leaf, orderedLeaves)) {
    return { ok: false, reason: "Earlier tasks in the project plan must be completed first." };
  }

  if (!dependsOnSatisfied(leaf, items)) {
    return { ok: false, reason: "Dependency tasks must be completed first." };
  }

  return { ok: true };
}

/**
 * The nearest ancestor whose **derived** status is `blocked`, if any.
 *
 * The derivation, not the column: `projects show` overrides a container's status from its children, and a
 * gate reading the column instead refuses a release for an item the tree does not report as blocked — or, the
 * measured direction on run `s08r10`, lets one through while naming an ancestor the tree says is fine.
 */
function inheritedBlockOf(
  leaf: WorkItemRecord,
  derived: Map<string, DerivedWorkItemStatus>,
  pmStore: PmStore,
): WorkItemRecord | undefined {
  return pmStore
    .getAncestors(leaf.id)
    .find((ancestor) => derived.get(ancestor.id)?.status === "blocked");
}

export function hasActiveExecution(leaves: WorkItemRecord[]): boolean {
  return leaves.some((leaf) => leaf.status === "in_progress");
}

export function findNextExecutableWorkItem(
  pmStore: PmStore,
  projectId: string,
  blockageStore?: BlockageStore,
  journalStore?: JournalStore,
): WorkItemRecord | null {
  const triage = findNextBlockerTriageWorkItem(pmStore, blockageStore, projectId);
  if (triage) return triage;

  const split = findNextLeafSplitWorkItem(pmStore, projectId);
  if (split) return split;

  const phaseGate = findNextPhaseGateWorkItem(pmStore, projectId);
  if (phaseGate?.status === "todo") return phaseGate;

  const items = listActiveWorkItems(pmStore, projectId);
  const tree = pmStore.buildWorkItemTree(items);
  const leaves = collectLeavesInOrder(tree);

  if (hasActiveExecution(leaves)) return null;

  for (const leaf of leaves) {
    if (canExecuteLeaf(leaf, leaves, items, pmStore, { journalStore, blockageStore }).ok) {
      return leaf;
    }
  }

  return null;
}

function isRootTrackComplete(item: WorkItemRecord): boolean {
  return item.status === "done" || item.status === "cancelled";
}

function isTrackComplete(node: WorkItemTreeNode): boolean {
  const leaves = collectLeavesUnderNode(node);
  if (leaves.length === 0) {
    return isRootTrackComplete(node.item);
  }
  return leaves.every((leaf) => leaf.status === "done" || leaf.status === "cancelled");
}

export function findActiveRootTrack(nodes: WorkItemTreeNode[]): WorkItemTreeNode | null {
  for (const node of nodes) {
    if (!isTrackComplete(node)) {
      return node;
    }
  }
  return null;
}

export function collectLeavesUnderNode(node: WorkItemTreeNode): WorkItemRecord[] {
  if (node.children.length === 0) {
    return [node.item];
  }
  return collectLeavesInOrder(node.children);
}

function isActiveWorkItem(item: WorkItemRecord, itemsById: Map<string, WorkItemRecord>): boolean {
  if (item.status === "cancelled") return false;
  let parentId = item.parentId;
  while (parentId) {
    const parent = itemsById.get(parentId);
    if (!parent || parent.status === "cancelled") return false;
    parentId = parent.parentId;
  }
  return true;
}

function listActiveWorkItems(pmStore: PmStore, projectId: string): WorkItemRecord[] {
  const allItems = pmStore.listWorkItemsByProject(projectId);
  const itemsById = new Map(allItems.map((item) => [item.id, item]));
  return allItems.filter((item) => isActiveWorkItem(item, itemsById));
}

/** Next executable leaf within the current root-level track only (step mode). */
export function findNextStepWorkItem(
  pmStore: PmStore,
  projectId: string,
  journalStore?: JournalStore,
): { workItem: WorkItemRecord; track: WorkItemRecord } | null {
  const items = listActiveWorkItems(pmStore, projectId);
  const tree = pmStore.buildWorkItemTree(items);
  const allLeaves = collectLeavesInOrder(tree);

  if (hasActiveExecution(allLeaves)) return null;

  const activeTrackNode = findActiveRootTrack(tree);
  if (!activeTrackNode) return null;

  const trackLeaves = collectLeavesUnderNode(activeTrackNode);
  for (const leaf of trackLeaves) {
    if (canExecuteLeaf(leaf, trackLeaves, items, pmStore, { journalStore }).ok) {
      return { workItem: leaf, track: activeTrackNode.item };
    }
  }

  return null;
}

export function previewNextStep(
  pmStore: PmStore,
  projectId: string,
  journalStore?: JournalStore,
): {
  track: WorkItemRecord | null;
  workItem: WorkItemRecord | null;
  blockedReason?: string;
} {
  const items = listActiveWorkItems(pmStore, projectId);
  const tree = pmStore.buildWorkItemTree(items);
  const allLeaves = collectLeavesInOrder(tree);

  if (hasActiveExecution(allLeaves)) {
    const running = allLeaves.find((leaf) => leaf.status === "in_progress");
    return {
      track: null,
      workItem: running ?? null,
      blockedReason: "A task is already executing.",
    };
  }

  const activeTrackNode = findActiveRootTrack(tree);
  if (!activeTrackNode) {
    return { track: null, workItem: null };
  }

  const trackLeaves = collectLeavesUnderNode(activeTrackNode);
  for (const leaf of trackLeaves) {
    const check = canExecuteLeaf(leaf, trackLeaves, items, pmStore, { journalStore });
    if (check.ok) {
      return { track: activeTrackNode.item, workItem: leaf };
    }
  }

  for (const leaf of trackLeaves) {
    if (leaf.status === "done" || leaf.status === "cancelled") continue;
    const check = canExecuteLeaf(leaf, trackLeaves, items, pmStore, { journalStore });
    if (!check.ok) {
      return {
        track: activeTrackNode.item,
        workItem: leaf,
        blockedReason: check.reason,
      };
    }
  }

  return { track: activeTrackNode.item, workItem: null };
}

export function projectAutoExecuteKey(projectId: string): string {
  return `project_auto_execute:${projectId}`;
}
