import { CLOSURE_REFUSAL_JOURNAL_KIND } from "./closure-refusal.js";
import {
  enrichWorkItemExecution,
  executionPhaseLabel,
  type ExecutionPhase,
} from "./execution-status.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord, WorkItemStatus, WorkItemTreeNode } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";

export function deriveParentWorkItemStatus(childStatuses: WorkItemStatus[]): WorkItemStatus {
  if (childStatuses.length === 0) {
    throw new Error("deriveParentWorkItemStatus requires at least one child");
  }

  if (childStatuses.some((status) => status === "blocked")) return "blocked";
  if (childStatuses.some((status) => status === "in_progress")) return "in_progress";
  if (childStatuses.every((status) => status === "done")) return "done";
  if (childStatuses.every((status) => status === "cancelled")) return "cancelled";
  // **Finished is finished, whether a child was done or dismissed.** A plan with a conditional leaf — one written to
  // act only if a condition held, and to be dismissed when it did not — ends as `done` plus `cancelled`, and the two
  // arms above match neither: `every done` is false and `every cancelled` is false, so the arm below ("some child is
  // done") answered `in_progress` and the phase read as work still under way with every child settled. Measured
  // 2026-11-09 on suite 19 run `s19r17`: L1–L4 `done`, L5 dismissed because its trigger never fired, and the Phase R
  // container read `in_progress` forever — the run could not close and no queue was left to drain.
  const terminal = childStatuses.every((status) => status === "done" || status === "cancelled");
  if (terminal && childStatuses.some((status) => status === "done")) return "done";
  if (childStatuses.some((status) => status === "done")) return "in_progress";
  if (childStatuses.every((status) => status === "backlog")) return "backlog";
  return "todo";
}

export function effectiveWorkItemStatus(
  item: WorkItemRecord,
  executionPhase?: ExecutionPhase,
): WorkItemStatus {
  if (item.status === "blocked") return "blocked";
  if (item.status === "cancelled") return "cancelled";
  if (item.status === "done") return "done";
  if (
    item.status === "in_progress" ||
    executionPhase === "running" ||
    executionPhase === "queued"
  ) {
    return "in_progress";
  }
  if (executionPhase === "failed") return "blocked";
  return item.status;
}

export function deriveParentExecutionPhase(
  childPhases: ExecutionPhase[],
  rolledStatus: WorkItemStatus,
): ExecutionPhase {
  if (rolledStatus === "done") return "done";
  if (rolledStatus === "blocked") return "failed";
  if (childPhases.some((phase) => phase === "running")) return "running";
  if (childPhases.some((phase) => phase === "queued")) return "queued";
  if (childPhases.some((phase) => phase === "failed")) return "failed";
  if (childPhases.length > 0 && childPhases.every((phase) => phase === "done")) return "done";
  return "idle";
}

export function subtreeHasPendingEscalation(
  node: WorkItemTreeNode,
  pendingWorkItemIds: Set<string>,
): boolean {
  if (pendingWorkItemIds.has(node.item.id)) return true;
  return node.children.some((child) => subtreeHasPendingEscalation(child, pendingWorkItemIds));
}

/**
 * The status a node reads once its children are known.
 *
 * A container reads its children's status — that is the rule, and it is the rule [F-089] exists to put on the
 * surfaces that **act** as well as the ones that report. Two stored statuses are not derivations and must
 * survive it, though, because overwriting them loses a record:
 *
 * - **`blocked`** — an item whose own closure was refused holds the refusal, and its children cannot lift it.
 *   Measured on run `s08r10`'s data dir after one of its slices was released: `b7421984` is stored `blocked`
 *   with a `manual_review_rejected` refusal on record, its children were `todo`/`in_progress`, and the
 *   derivation printed it `[in_progress]` — so the container above it stopped reading `blocked` and the leaf
 *   under it became releasable over a refusal nobody had discharged.
 * - **`cancelled`** — the same argument, and a cancelled container's children are usually not cancelled.
 *
 * So the derivation is `deriveParentWorkItemStatus(childStatuses)` everywhere the item holds nothing of its
 * own, and the item's own record everywhere it does.
 */
export function rolledWorkItemStatus(own: WorkItemStatus, derived: WorkItemStatus): WorkItemStatus {
  return own === "blocked" || own === "cancelled" ? own : derived;
}

/**
 * The status of an item that **has children**: its children's, and never a block of its own.
 *
 * `rolledWorkItemStatus` keeps `blocked` because an item whose own closure was refused holds it, and nothing may
 * overwrite that with its children's column — true of a leaf, and false of a container, whose block is never its own
 * (`describeContainerBlock`). A container blocked *because a child was blocked* therefore stayed blocked after that
 * child closed: measured 2026-11-09 on suite 19 run `s19r17`, where the Phase R container read `blocked` with
 * `projects blocked` saying "nothing accounts for it", L1–L3 `done` and the runner green, and `play` answering
 * "No pending task to start right now" — every leaf beneath it refused by `canExecuteLeaf`. What cleared it was an
 * operator's `release`, per cycle, which is the cost this row exists to remove.
 */
export function rolledContainerStatus(derived: WorkItemStatus): WorkItemStatus {
  // `cancelled` is a decision about the container itself, not about the tree under it.
  return derived;
}

/**
 * The ids whose stored `blocked` is a rule against the item itself: a closure refusal on record.
 *
 * The one fact a rollup cannot read for itself, kept as a **checked** answer rather than a guess. Two measured
 * shapes pull in opposite directions and both are product rules:
 *
 * - a container blocked because a child was blocked must release once that child closes (F-108, suite 19
 *   `s19r18`: `LL-P1` stayed `blocked` with nothing accounting for it and every `play` refused);
 * - an item whose own closure was **refused** must keep that block however its children read, because the refusal
 *   is a decision still waiting to be discharged, and a rollup that overwrites it makes the item releasable over
 *   nobody's answer (eval 14/24, `eval-blocked-container-deadlock` *"cannot lift an item's own refusal however
 *   its children read"*).
 *
 * `undefined` means the caller could not tell, and then a stored block **stands** — the safe direction, since
 * dropping an undischarged refusal closes work nobody approved. A caller that has read the journal passes the
 * set, and a caller that has read it and found nothing passes an empty one.
 */
export function ownBlockWorkItemIds(
  journalStore: JournalStore | undefined,
  projectId: string,
): Set<string> | undefined {
  if (!journalStore) return undefined;
  const refused = new Set<string>();
  for (const entry of journalStore.listByProject(projectId, { kinds: [CLOSURE_REFUSAL_JOURNAL_KIND] })) {
    if (entry.workItemId) refused.add(entry.workItemId);
  }
  return refused;
}

/** Whether a node with children keeps the `blocked` it was written with. */
function containerKeepsOwnBlock(
  item: WorkItemRecord,
  ownBlockIds: ReadonlySet<string> | undefined,
): boolean {
  if (item.status !== "blocked") return false;
  if (ownBlockIds === undefined) return true;
  return ownBlockIds.has(item.id);
}

export function applyWorkItemStatusRollup(
  nodes: WorkItemTreeNode[],
  pendingWorkItemIds: Set<string> = new Set(),
  ownBlockIds?: ReadonlySet<string>,
): WorkItemTreeNode[] {
  return nodes.map((node) => {
    const children = applyWorkItemStatusRollup(node.children, pendingWorkItemIds, ownBlockIds);
    if (children.length === 0) {
      return { item: node.item, children };
    }

    const childStatuses = children.map((child) => {
      if (subtreeHasPendingEscalation(child, pendingWorkItemIds)) return "blocked";
      const phase = "executionPhase" in child.item
        ? (child.item as WorkItemRecord & { executionPhase?: ExecutionPhase }).executionPhase
        : undefined;
      return effectiveWorkItemStatus(child.item, phase);
    });

    return {
      item: {
        ...node.item,
        // A container's column is its children's — `rolledContainerStatus`, not `rolledWorkItemStatus`: a
        // container's block is never its own (`describeContainerBlock`), and keeping it once its children cleared
        // it is what made every `play` answer "Parent … is blocked" on a phase whose leaves were fine. Measured
        // 2026-11-11 on suite 19 run `s19r18`, where `LL-P1` was written `blocked` by two escalation freezes,
        // neither of which cleared it, and the line needed an operator `release` per phase to move (BOARD F-108).
        // `cancelled` still survives, because that is a decision about the container itself rather than a block a
        // child put there; `blocked` does not, because a container's block is never its own.
        status:
          node.item.status === "cancelled"
            ? "cancelled"
            : containerKeepsOwnBlock(node.item, ownBlockIds)
              ? "blocked"
              : rolledContainerStatus(deriveParentWorkItemStatus(childStatuses)),
      },
      children,
    };
  });
}

export function rollupWorkItemTreeWithExecution(
  nodes: WorkItemTreeNode[],
  store: Store,
  pendingWorkItemIds: Set<string> = new Set(),
  ownBlockIds?: ReadonlySet<string>,
): ExecutionWorkItemNode[] {
  return nodes.map((node) => {
    const children = rollupWorkItemTreeWithExecution(node.children, store, pendingWorkItemIds, ownBlockIds);
    let item = enrichWorkItemExecution(node.item, store);

    if (children.length > 0) {
      const childStatuses = children.map((child) => {
        if (subtreeHasPendingEscalation(child, pendingWorkItemIds)) return "blocked";
        return effectiveWorkItemStatus(child.item, child.item.executionPhase);
      });
      // The reporting shape obeys the same rule as the acting one: a container's column is its children's, and a
      // container's own `blocked` — written by an escalation freeze that something else cleared — is not a rule it
      // holds. Otherwise `projects show` prints a phase as blocked while `play` is willing to run it, and the two
      // surfaces disagree about one tree (`work-item-status-rollup.ts`, BOARD F-108).
      const status =
        node.item.status === "cancelled"
          ? "cancelled"
          : containerKeepsOwnBlock(node.item, ownBlockIds)
            ? "blocked"
            : rolledContainerStatus(deriveParentWorkItemStatus(childStatuses));
      const executionPhase = deriveParentExecutionPhase(
        children.map((child) => child.item.executionPhase),
        status,
      );
      item = {
        ...item,
        status,
        executionPhase,
        executionLabel: executionPhaseLabel(executionPhase),
      };
    }

    return { item, children };
  });
}

export interface ExecutionWorkItemNode {
  item: WorkItemRecord & { executionPhase: ExecutionPhase; executionLabel: string };
  children: ExecutionWorkItemNode[];
}

export function buildPendingEscalationWorkItemIds(
  pendingRecords: Array<{ workItemId?: string }>,
): Set<string> {
  const ids = new Set<string>();
  for (const record of pendingRecords) {
    if (record.workItemId) ids.add(record.workItemId);
  }
  return ids;
}

/**
 * The status the read surfaces show for one item, plus what a container is waiting on when that is `blocked`.
 */
export interface DerivedWorkItemStatus {
  /** The status `kampaku projects show` and `GET /api/v1/projects/:slug` render for this item. */
  status: WorkItemStatus;
  /**
   * For a container whose derived status is `blocked`: the child that carries the block.
   *
   * A container's block is never its own rule — `decideWorkItemClosure` decides it against its **own**
   * settled job, which is a different question — so a surface that has to name *what the container is
   * waiting on* needs this, not a refusal read for the container itself.
   */
  waitingOn?: { workItemId: string; title: string };
}

/**
 * Every item's status as the read surfaces compute it, keyed by id — the derivation, exposed to the
 * surfaces that **act**.
 *
 * Why this exists. `applyWorkItemStatusRollup` / `rollupWorkItemTreeWithExecution` **derive** a parent's
 * status from its children, and the derived value overrides the stored column in the returned tree, while
 * `PmStore` still holds what was last written. A release gate that reads the column therefore refuses one
 * item and names another: measured 2026-10-02 on suite 08's third run `s08r10` (BOARD F-089), the
 * container `c04462e4` was stored `in_progress` and printed `[blocked]` by `projects show`, while
 * `execute_work_item` on the leaf beneath it was refused with *'Parent "CLI surface and packaging"
 * (c04462e4) is blocked'* — a parent whose stored status was not blocked at all.
 *
 * The rule here is the read surfaces' own rule, called rather than re-implemented: `applyWorkItemStatusRollup`
 * is the function `projects show` reads, so the two cannot drift. Two deliberate boundaries, both about not
 * trading one disagreement for another:
 *
 * - `pendingWorkItemIds` is the caller's, because only the caller holds the question and blockage stores.
 *   Absent, the derivation is the one `rollupParentWorkItemStatuses` maintains in the column — a pending
 *   escalation writes `blocked` into the item it is against (`blockWorkItemAndDescendants`), so the item's
 *   own block, and everything under it, is already in the statuses this reads.
 * - The execution-phase refinement (`effectiveWorkItemStatus` mapping a **failed** phase to `blocked`) is
 *   the read surfaces' and stays there: it is derived from a job, and a work item whose job failed and whose
 *   status is still `todo` is work the operator's release is the right answer to.
 */
export function derivedWorkItemStatuses(
  pmStore: PmStore,
  projectId: string,
  pendingWorkItemIds: Set<string> = new Set(),
  ownBlockIds?: ReadonlySet<string>,
): Map<string, DerivedWorkItemStatus> {
  const tree = pmStore.buildWorkItemTree(pmStore.listWorkItemsByProject(projectId));
  const rolled = applyWorkItemStatusRollup(tree, pendingWorkItemIds, ownBlockIds);
  const derived = new Map<string, DerivedWorkItemStatus>();

  const visit = (nodes: WorkItemTreeNode[]): void => {
    for (const node of nodes) {
      let waitingOn: DerivedWorkItemStatus["waitingOn"];
      if (node.children.length > 0 && node.item.status === "blocked") {
        // The child the container's block comes from: one that is blocked itself, **or** one a pending
        // escalation is open against — the second arm is `subtreeHasPendingEscalation`, which is what made
        // the container blocked in the first place. Without it a container frozen by a blocker raised on a
        // child had no child to name, and the sentence fell through to its own settled job: measured
        // 2026-10-02 on run `s08r10`, where `c04462e4` read *"its settled job satisfies every closure rule
        // that now stands"* while the block was the blocker open on `447e4e2b` under it (BOARD F-089).
        const blockedChild = node.children.find(
          (child) =>
            child.item.status === "blocked" ||
            subtreeHasPendingEscalation(child, pendingWorkItemIds),
        );
        if (blockedChild) {
          waitingOn = { workItemId: blockedChild.item.id, title: blockedChild.item.title };
        }
      }
      derived.set(node.item.id, {
        status: node.item.status,
        ...(waitingOn ? { waitingOn } : {}),
      });
      visit(node.children);
    }
  };
  visit(rolled);
  return derived;
}

export function rollupProjectWorkItems(
  pmStore: PmStore,
  store: Store,
  projectId: string,
  pendingWorkItemIds: Set<string> = new Set(),
): ReturnType<typeof rollupWorkItemTreeWithExecution> {
  const tree = pmStore.buildWorkItemTree(pmStore.listWorkItemsByProject(projectId));
  return rollupWorkItemTreeWithExecution(tree, store, pendingWorkItemIds);
}
