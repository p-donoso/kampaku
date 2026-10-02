import type { PmStore, WorkItemRecord, WorkItemTreeNode } from "../../persistence/pm-store.js";
import { findNextBlockerTriageWorkItem, isBlockerTriageWorkItem } from "./blocker-triage.js";
import { findNextPhaseGateWorkItem, isPhaseGateWorkItem } from "./phase-auditor-gate.js";
import { findNextLeafSplitWorkItem, isLeafSplitWorkItem } from "./leaf-splitter.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import {
  describeClosureRefusal,
  describeUnrecordedBlock,
  readLatestClosureRefusal,
} from "./closure-refusal.js";

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
 */
export function dependsOnSatisfied(leaf: WorkItemRecord, items: WorkItemRecord[]): boolean {
  if (leaf.dependsOn.length === 0) return true;
  const done = new Set(
    items.filter((item) => item.status === "done").flatMap((item) => [item.id, item.title]),
  );
  return leaf.dependsOn.every((dep) => done.has(dep));
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
  // recorded, and without it a `blocked` leaf can only be reported as blocked (BOARD F-088).
  journalStore?: JournalStore,
): { ok: true } | { ok: false; reason: string } {
  if (leaf.status === "done" || leaf.status === "cancelled") {
    return { ok: false, reason: "Task is already finished." };
  }

  if (leaf.status === "in_progress") {
    return { ok: false, reason: "Task is already executing." };
  }

  if (leaf.status === "blocked") {
    // The rule that refused, the field it read and the command that clears it — never a list of possible
    // causes. The sentence this replaces — *"Task is blocked by an error, pending question, or blocker."* —
    // named three causes and all three were empty on the measured specimen (BOARD F-088).
    const refusal = readLatestClosureRefusal(journalStore, leaf.id);
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

  const ancestors = pmStore.getAncestors(leaf.id);
  const blockedAncestor = ancestors.find((ancestor) => ancestor.status === "blocked");
  if (blockedAncestor) {
    const refusal = readLatestClosureRefusal(journalStore, blockedAncestor.id);
    return {
      ok: false,
      reason: `Parent "${blockedAncestor.title}" (${blockedAncestor.id.slice(0, 8)}) is blocked: ${
        refusal
          ? describeClosureRefusal(refusal)
          : describeUnrecordedBlock(blockedAncestor, leaf.projectId)
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

export function hasActiveExecution(leaves: WorkItemRecord[]): boolean {
  return leaves.some((leaf) => leaf.status === "in_progress");
}

export function findNextExecutableWorkItem(
  pmStore: PmStore,
  projectId: string,
  blockageStore?: BlockageStore,
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
    if (canExecuteLeaf(leaf, leaves, items, pmStore).ok) {
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
): { workItem: WorkItemRecord; track: WorkItemRecord } | null {
  const items = listActiveWorkItems(pmStore, projectId);
  const tree = pmStore.buildWorkItemTree(items);
  const allLeaves = collectLeavesInOrder(tree);

  if (hasActiveExecution(allLeaves)) return null;

  const activeTrackNode = findActiveRootTrack(tree);
  if (!activeTrackNode) return null;

  const trackLeaves = collectLeavesUnderNode(activeTrackNode);
  for (const leaf of trackLeaves) {
    if (canExecuteLeaf(leaf, trackLeaves, items, pmStore).ok) {
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
    const check = canExecuteLeaf(leaf, trackLeaves, items, pmStore, journalStore);
    if (check.ok) {
      return { track: activeTrackNode.item, workItem: leaf };
    }
  }

  for (const leaf of trackLeaves) {
    if (leaf.status === "done" || leaf.status === "cancelled") continue;
    const check = canExecuteLeaf(leaf, trackLeaves, items, pmStore, journalStore);
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
