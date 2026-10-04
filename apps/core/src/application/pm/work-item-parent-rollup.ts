import { deriveParentWorkItemStatus, rolledWorkItemStatus } from "./work-item-status-rollup.js";
import type { PmStore } from "../../persistence/pm-store.js";

/**
 * Writes the derived status into the column, for the item itself and for its ancestors.
 *
 * `rollupParentWorkItemStatuses` walks **up** from an item, which is what a leaf's closure owes: the leaf's
 * own status is the decision, its ancestors' are derived from it. An item that **has children** is the other
 * case, and it was missing: `attemptWorkItemClosure` wrote `done` into a container whose own settled job
 * satisfied every rule, and nothing ever re-derived that container from its children again — so its column
 * said one thing and every read surface said the other (measured 2026-10-02 on suite 08's third run
 * `s08r10`: container `c04462e4` stored `done` at `19:07:42Z` and printed `[blocked]` in the same second,
 * BOARD F-089).
 *
 * A container's status is its children's; that is the rule `deriveParentWorkItemStatus` states, and a
 * decision about a container's *own* settled job is a different fact that must not overwrite it.
 */
export function rollupDerivedStatusForItemAndAncestors(pmStore: PmStore, workItemId: string): void {
  const item = pmStore.getWorkItem(workItemId);
  if (item) {
    const children = pmStore
      .listWorkItemsByProject(item.projectId)
      .filter((child) => child.parentId === item.id);
    if (children.length > 0) {
      // `rolledWorkItemStatus`, not the bare derivation: an item whose own closure was refused holds
      // `blocked`, and this function is called on the line right after that refusal is written. Overwriting it
      // with the children's status is how the column came to disagree with the journal (BOARD F-089).
      const nextStatus = rolledWorkItemStatus(
        item.status,
        deriveParentWorkItemStatus(children.map((child) => child.status)),
      );
      if (item.status !== nextStatus) {
        pmStore.updateWorkItem(item.id, { status: nextStatus });
      }
    }
  }
  rollupParentWorkItemStatuses(pmStore, workItemId);
}

export function rollupParentWorkItemStatuses(pmStore: PmStore, workItemId: string): void {
  let current = pmStore.getWorkItem(workItemId);
  while (current?.parentId) {
    const parent = pmStore.getWorkItem(current.parentId);
    if (!parent) break;

    const siblings = pmStore
      .listWorkItemsByProject(parent.projectId)
      .filter((item) => item.parentId === parent.id);
    if (siblings.length === 0) break;

    const nextStatus = deriveParentWorkItemStatus(siblings.map((item) => item.status));
    if (parent.status !== nextStatus) {
      pmStore.updateWorkItem(parent.id, { status: nextStatus });
    }
    current = parent;
  }
}
