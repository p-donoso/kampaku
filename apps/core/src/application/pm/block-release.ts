/**
 * @module application/pm/block-release
 *
 * **Releasing a block that no rule and no escalation accounts for.**
 *
 * Why this exists. A work item can read `blocked` for four reasons, and three of them name something the
 * operator can act on: its own closure refusal (a rule, with the command that clears it), an escalation open
 * against it (a blocker or a question, with the command that clears that), or a child of it that carries one
 * of the two. The fourth is the one this module is for: an item left `blocked` by a freeze nobody kept a
 * record of, with nothing above it that names a rule either — before `escalation-work-item.ts` recorded what
 * an escalation froze, `blockWorkItemAndDescendants` wrote `blocked` into every descendant of the item it
 * named and the escalation row carried one status for one item. Measured 2026-10-02 on run `s08r10`: two
 * blockers raised against the container `8419cdbd`; the operator cleared both, the container went back to
 * `todo`, and `02643727`, `593b665a` and `2edbed14` stayed `blocked` with *"no closure decision naming the
 * rule is on record for it"*, circulating: the container read blocked **because of them** (BOARD F-089).
 *
 * The command refuses every block that **is** accounted for. That is the whole safety property: it cannot be
 * used to walk past a gate, because a gate always names a rule or an escalation, and this path only exists
 * where both are absent. What it does is put the release on record with who took it and what they decided —
 * the same discipline `kampaku risks accept` and `kampaku projects closure` follow.
 */

import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord, WorkItemStatus } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import { rollupParentWorkItemStatuses } from "./work-item-parent-rollup.js";
import { deriveParentWorkItemStatus, derivedWorkItemStatuses, ownBlockWorkItemIds } from "./work-item-status-rollup.js";
import {
  carriesOwnBlock,
  explainBlockedWorkItem,
  pendingEscalationsForWorkItem,
  type BlockedItemExplanationContext,
} from "./blocked-item-explanation.js";
import {
  describeBlockedItem,
  describeClosureRefusal,
  readLatestClosureRefusal,
} from "./closure-refusal.js";

export class BlockReleaseError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION" = "VALIDATION") {
    super(message);
    this.name = "BlockReleaseError";
  }
}

export interface BlockReleaseContext extends BlockedItemExplanationContext {
  pmStore: PmStore;
  journalStore?: JournalStore;
  blockageStore?: BlockageStore;
  questionStore?: QuestionStore;
  agentStore?: AgentStore;
}

export interface BlockReleaseResult {
  workItemId: string;
  workItemTitle: string;
  /** What it read before the release, and what it reads after — the read-back, not the decision. */
  statusBefore: WorkItemStatus;
  status: WorkItemStatus;
  recorded: string;
  recordedEntryId?: string;
}

/**
 * The ancestor whose block **is** this item's block, when that ancestor holds a record of its own: a closure
 * refusal, or an escalation open against it. That record is a command, and the release must not stand in for
 * it.
 *
 * Deliberately narrow. An ancestor that merely reads `blocked` — because another child of it is blocked, or
 * because a freeze left it that way — is not an account: releasing **this** item does not lift the ancestor's
 * block, so refusing because of it would be a refusal for a reason the operator cannot act on. That is the
 * shape the run's own tree had: `02643727` and `593b665a` each blocked because the other was.
 */
function accountableAncestor(
  ctx: BlockReleaseContext,
  workItem: WorkItemRecord,
): { workItemId: string; title: string; detail: string } | undefined {
  const derived = derivedWorkItemStatuses(
    ctx.pmStore,
    workItem.projectId,
    new Set(),
    ownBlockWorkItemIds(ctx.journalStore, workItem.projectId),
  );
  for (const ancestor of ctx.pmStore.getAncestors(workItem.id)) {
    if (!carriesOwnBlock(ctx, derived, ancestor.id, ancestor.projectId)) continue;
    const refusal = readLatestClosureRefusal(ctx.journalStore, ancestor.id);
    if (refusal) {
      return { workItemId: ancestor.id, title: ancestor.title, detail: describeClosureRefusal(refusal) };
    }
    const escalations = pendingEscalationsForWorkItem(ctx, ancestor.id, ancestor.projectId);
    return {
      workItemId: ancestor.id,
      title: ancestor.title,
      detail:
        `${escalations.length} pending escalation(s) are open against it: ` +
        escalations.map((escalation) => `${escalation.kind} ${escalation.id}`).join(", "),
    };
  }
  return undefined;
}

/**
 * The status a released item reads: its children's, when it has them, and `todo` when it does not.
 *
 * `todo` and not the status it held before the freeze, because that status is exactly what was lost — and a
 * released item is work the operator has decided may run, which is what `todo` means.
 */
function releasedStatus(ctx: BlockReleaseContext, workItem: WorkItemRecord): WorkItemStatus {
  const children = ctx.pmStore
    .listWorkItemsByProject(workItem.projectId)
    .filter((child) => child.parentId === workItem.id);
  if (children.length === 0) return "todo";
  return deriveParentWorkItemStatus(children.map((child) => child.status));
}

export function releaseUnaccountedBlock(
  ctx: BlockReleaseContext,
  input: { workItemId: string; by: string; notes: string },
): BlockReleaseResult {
  const workItem = ctx.pmStore.getWorkItem(input.workItemId);
  if (!workItem) throw new BlockReleaseError("Work item not found.", "NOT_FOUND");
  if (workItem.status !== "blocked") {
    throw new BlockReleaseError(
      `"${workItem.title}" reads ${workItem.status}, not blocked: there is no block to release.`,
      "CONFLICT",
    );
  }
  if (!input.by.trim() || !input.notes.trim()) {
    throw new BlockReleaseError(
      "A release needs both who took it and what they decided: --by <who> --notes \"<what was checked>\".",
    );
  }
  if (!ctx.journalStore) throw new BlockReleaseError("The work-item journal is not available.");

  // Accounted for, and therefore not releasable here: the item's own rule, an escalation on it, or either of
  // those on an ancestor. Each of those has its own command, and each is named in the refusal.
  const refusal = readLatestClosureRefusal(ctx.journalStore, workItem.id);
  if (refusal) {
    throw new BlockReleaseError(
      describeBlockedItem({ workItem, refusal, projectRef: workItem.projectId }),
      "CONFLICT",
    );
  }
  const escalations = pendingEscalationsForWorkItem(ctx, workItem.id, workItem.projectId);
  if (escalations.length > 0) {
    throw new BlockReleaseError(
      describeBlockedItem({ workItem, escalations, projectRef: workItem.projectId }),
      "CONFLICT",
    );
  }
  const ancestor = accountableAncestor(ctx, workItem);
  if (ancestor) {
    throw new BlockReleaseError(
      `"${workItem.title}" (${workItem.id.slice(0, 8)}) is blocked by "${ancestor.title}" ` +
        `(${ancestor.workItemId.slice(0, 8)}), which is where the block is accounted for: ${ancestor.detail}`,
      "CONFLICT",
    );
  }

  const { detail } = explainBlockedWorkItem(ctx, workItem, workItem.projectId);
  const statusBefore = workItem.status;
  const status = releasedStatus(ctx, workItem);
  ctx.pmStore.updateWorkItem(workItem.id, {
    status,
    ...(status === "todo" ? { goalId: undefined, jobId: undefined } : {}),
  });
  rollupParentWorkItemStatuses(ctx.pmStore, workItem.id);

  const entry = ctx.journalStore.append({
    projectId: workItem.projectId,
    workItemId: workItem.id,
    kind: "block_released",
    fromAgentId: ctx.agentStore?.getAgentBySlugOrId(input.by)?.id,
    toAgentId: workItem.assigneeAgentId,
    title: `Block released: "${workItem.title}"`,
    body:
      `${input.by} released the block on "${workItem.title}" (${workItem.id}), which no closure rule and no ` +
      `pending escalation accounted for: ${input.notes.trim()}\n\nWhat the block read as: ${detail}`,
    refType: "work_item",
    refId: workItem.id,
    metadata: { releasedBy: input.by, statusBefore, status },
  });

  return {
    workItemId: workItem.id,
    workItemTitle: workItem.title,
    statusBefore,
    status,
    recorded: `${input.by} released the block on "${workItem.title}"`,
    recordedEntryId: entry.id,
  };
}
