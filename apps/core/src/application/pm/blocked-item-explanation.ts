/**
 * @module application/pm/blocked-item-explanation
 *
 * **One answer to "what is this item blocked by?", for every surface that has to say it.**
 *
 * Why this module exists. An item that reads `blocked` can be blocked by four different things, and before
 * this the surfaces answered with the same sentence for all of them — *"is blocked and no closure decision
 * naming the rule is on record for it"* — which is a true statement about the closure journal and a useless
 * one about the item:
 *
 * 1. **its own closure refusal** — a rule that read the work and refused it (`closure-refusal.ts`, BOARD
 *    F-088). Already legible and dischargeable, and unchanged here.
 * 2. **a pending escalation against it** — a blocker or a question freezes the item it is raised against,
 *    via `blockWorkItemAndDescendants`, so an item can be `blocked` before any closure rule has run at all.
 *    Measured 2026-10-02 on suite 08's third run `s08r10` (BOARD F-089): the container `8419cdbd` read
 *    `blocked` with **two** blockers pending against it (`263514fb`, `c4880c7a`, both held by the operator's
 *    own desk), and no surface in the product named either of them.
 * 3. **a child, when the item is a container** — a container's status is derived from its children
 *    (`deriveParentWorkItemStatus`), and its *own* closure rule decides a different question (its own settled
 *    job), which is why `kampaku projects closure <container>` printed *"is done"* while every read-back
 *    printed `[blocked]`. What stops the line is the child: name it, with the child's rule and the child's
 *    command.
 * 4. **nothing of its own, only its container** — an item frozen because a blocker was raised against an
 *    ancestor. It has no record of its own at all, so no rule can be printed; the honest sentence says which
 *    container it is blocked with, and the release gate is the surface that decides whether that block is
 *    enough to refuse it (it is not, for a triage, split or phase-gate item — see `work-item-order`).
 *
 * The statuses here come from `derivedWorkItemStatuses`, the same derivation `kampaku projects show` and
 * `GET /api/v1/projects/:slug` render, so a surface that acts and a surface that reports cannot disagree
 * about *which* item is blocked.
 */

import type { AgentStore } from "../../persistence/agent-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import {
  describeBlockedItem,
  describeUnrecordedBlock,
  readLatestClosureRefusal,
  type BlockedWorkItemReport,
  type ClosureRefusal,
  type PendingEscalation,
  type UnrecordedBlockVerdict,
} from "./closure-refusal.js";
import {
  buildPendingEscalationWorkItemIds,
  derivedWorkItemStatuses,
  type DerivedWorkItemStatus,
} from "./work-item-status-rollup.js";

export interface BlockedItemExplanationContext {
  pmStore: PmStore;
  journalStore?: JournalStore;
  blockageStore?: BlockageStore;
  questionStore?: QuestionStore;
  agentStore?: AgentStore;
  /**
   * The read-only closure decision for an item with no refusal on record, from the surface that holds the
   * job and memory stores. Absent, an item in that state gets the honest unrecorded sentence.
   */
  fresh?: (item: Pick<WorkItemRecord, "id" | "title" | "projectId">) => UnrecordedBlockVerdict | undefined;
}

export interface BlockedItemExplanation {
  workItemId: string;
  title: string;
  /** The derived status — what the read surfaces render for this item. */
  status: DerivedWorkItemStatus["status"];
  refusal?: ClosureRefusal;
  escalations: PendingEscalation[];
  /** For a container: the child that carries the block. */
  waitingOn?: DerivedWorkItemStatus["waitingOn"];
  /** The sentence the operator reads. Never a list of possible causes. */
  detail: string;
}

/** How far down a chain of containers the sentence follows before it stops naming and points instead. */
const EXPLAIN_MAX_DEPTH = 4;

function oneLine(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function slugOrId(agentStore: AgentStore | undefined, agentId: string): string {
  return agentStore?.getAgentBySlugOrId(agentId)?.slug ?? agentId;
}

/**
 * The escalations open against exactly this item, in the order they were raised — **including a question
 * asked about the whole project, when the caller names the project.**
 *
 * The project-scoped case is not a variant, it is the ordinary one for a decision about scope or staffing:
 * the front office asks the emperor something that belongs to no single step, and `blockWorkItemSubtree`
 * freezes every item under the container it names. Measured on suite 07's run `s07r21` (2026-10-20): two
 * `required` questions — *"Which work order should I plan the first vertical slice for?"* and *"Which roster
 * should I create under textstats-lead?"* — were pending while the container and all six leaves read
 * `blocked`, and every read surface answered *"blocked and nothing accounts for it: no closure rule on it,
 * none above it, and no pending escalation anywhere in its chain. Release it, naming who takes the
 * decision: kampaku projects release …"*. The journal held `escalation_paused_items` for the same second.
 * This function filtered on `workItemId` alone, so a question with no work item matched nothing, and the
 * sentence the operator acts on named the one command that cannot free the plan — a release — instead of
 * `kampaku questions answer <id> "<the decision>"`.
 */
export function pendingEscalationsForWorkItem(
  ctx: Pick<BlockedItemExplanationContext, "blockageStore" | "questionStore" | "agentStore">,
  workItemId: string,
  projectId?: string,
): PendingEscalation[] {
  const escalations: PendingEscalation[] = [];
  for (const blocker of ctx.blockageStore?.listPending() ?? []) {
    if (blocker.workItemId !== workItemId) continue;
    escalations.push({
      id: blocker.id,
      kind: "blocker",
      heldBy: slugOrId(ctx.agentStore, blocker.recipientAgentId),
      description: oneLine(blocker.description),
    });
  }
  for (const question of ctx.questionStore?.listPending() ?? []) {
    // A question that names one item belongs to that item. A question that names only the project holds
    // every item under it, which is what the freeze already did to the rows.
    const belongs = question.workItemId
      ? question.workItemId === workItemId
      : Boolean(projectId) && question.projectId === projectId;
    if (!belongs) continue;
    escalations.push({
      id: question.id,
      kind: "question",
      heldBy: slugOrId(ctx.agentStore, question.recipientAgentId),
      description: oneLine(question.question),
    });
  }
  return escalations;
}

/**
 * The explanation for one item, resolved against the derivation and the records that exist about it.
 *
 * Recursive on purpose: a container's sentence carries the waiting-on item's sentence, and an item frozen
 * from above carries the sentence of the ancestor that carries the block. Both are looked up so the chain
 * **ends**: an ancestor is only named when it holds a block of its own — a closure refusal, or an escalation
 * open against it — so the last item named is one whose sentence names a rule and a command rather than
 * another item. Bounded as well, so a deep tree cannot produce an unbounded line: past the bound the sentence
 * points at the item instead of paraphrasing it.
 *
 * Why the bound alone was not enough, measured on run `s08r10`'s own tree: naming the **nearest** blocked
 * ancestor made `02643727` name `593b665a` and `593b665a` name `02643727` back — each blocked with the other
 * and no rule between them — so the sentence repeated the same two clauses until the depth bound and named no
 * command the operator could run.
 */
/**
 * Whether this item's block is its **own**: a closure refusal on record, or an escalation open against it.
 *
 * The distinction is what makes a chain of sentences end: an item that holds one of these can be named as what
 * another item waits on, because its own sentence is about a rule; an item that holds neither is blocked only
 * because of something else, and naming it as a reason produces a sentence that names nothing.
 */
export function carriesOwnBlock(
  ctx: Pick<BlockedItemExplanationContext, "journalStore" | "blockageStore" | "questionStore" | "agentStore">,
  derived: Map<string, DerivedWorkItemStatus>,
  workItemId: string,
  projectId?: string,
): boolean {
  if (derived.get(workItemId)?.status !== "blocked") return false;
  return (
    readLatestClosureRefusal(ctx.journalStore, workItemId) !== undefined ||
    pendingEscalationsForWorkItem(ctx, workItemId, projectId).length > 0
  );
}

export function explainBlockedWorkItem(
  ctx: BlockedItemExplanationContext,
  workItem: Pick<WorkItemRecord, "id" | "title" | "projectId">,
  projectRef: string,
  options: {
    derived?: Map<string, DerivedWorkItemStatus>;
    depth?: number;
    /**
     * Whether a container's sentence carries the waiting-on item's sentence inside it.
     *
     * `true` for a surface that gives the operator **one** message — the gate's `blockedReason`, a refusal on
     * a release, the discharge's read-back — where the chain has to be complete to be actionable. `false` for
     * a surface that lists every blocked item of the project, where each item's own entry already carries its
     * rule and its command and reprinting them under another item's id is what made a container read as the
     * item the next decision belonged to (BOARD F-089, `13dee64`).
     */
    embedChain?: boolean;
  } = {},
): BlockedItemExplanation {
  const derived = options.derived ?? derivedWorkItemStatuses(ctx.pmStore, workItem.projectId);
  const depth = options.depth ?? 0;
  const embedChain = options.embedChain ?? true;
  const entry = derived.get(workItem.id);
  const refusal = readLatestClosureRefusal(ctx.journalStore, workItem.id);
  const escalations = pendingEscalationsForWorkItem(ctx, workItem.id, workItem.projectId);
  const waitingOn = entry?.waitingOn;

  const resolve = (
    other: Pick<WorkItemRecord, "id" | "title" | "projectId">,
  ): string | undefined =>
    !embedChain
      ? undefined
      : depth + 1 >= EXPLAIN_MAX_DEPTH
        ? describeUnrecordedBlock(other, projectRef)
        : explainBlockedWorkItem(ctx, other, projectRef, { derived, depth: depth + 1 }).detail;

  // An item blocked from above: nothing about it refused anything, so it has no rule of its own to print —
  // the ancestor that carries the block has one, and its sentence is what the operator has to read.
  const blockedAncestors = refusal || escalations.length > 0 || waitingOn
    ? []
    : ctx.pmStore
        .getAncestors(workItem.id)
        .filter((ancestor) => derived.get(ancestor.id)?.status === "blocked");
  const inheritedFrom = blockedAncestors.find((ancestor) =>
    carriesOwnBlock(ctx, derived, ancestor.id, ancestor.projectId),
  );
  // Nothing of its own, nothing above it that carries a rule or an escalation, and it is blocked: the block
  // is not accounted for by any record, and the sentence has to say so and give the command that clears it
  // instead of pointing at an ancestor that is only blocked because of **this** item (BOARD F-089).
  const fresh = refusal ? undefined : ctx.fresh?.(workItem);
  const unaccounted =
    !refusal &&
    escalations.length === 0 &&
    !waitingOn &&
    !inheritedFrom &&
    // Only when the closure rules themselves have nothing to say about it. An item whose settled job would
    // close it has a command already — `kampaku projects closure <id>` — and that command is what the operator
    // must be given, not a release (BOARD F-088's lock asserts exactly that).
    (fresh === undefined || fresh.verdict === "no_settled_job");
  const unaccountedWith = unaccounted ? blockedAncestors[0] : undefined;

  const detail = describeBlockedItem({
    workItem,
    ...(refusal ? { refusal } : {}),
    ...(escalations.length > 0 ? { escalations } : {}),
    ...(waitingOn
      ? {
          waitingOn: {
            ...waitingOn,
            detail: resolve(ctx.pmStore.getWorkItem(waitingOn.workItemId) ?? workItem),
          },
        }
      : {}),
    ...(inheritedFrom
      ? {
          inheritedFrom: {
            workItemId: inheritedFrom.id,
            title: inheritedFrom.title,
            detail: resolve(inheritedFrom),
          },
        }
      : {}),
    ...(unaccounted ? { unaccounted: true as const } : {}),
    ...(unaccountedWith ? { unaccountedWith: { workItemId: unaccountedWith.id, title: unaccountedWith.title } } : {}),
    projectRef,
    ...(fresh ? { fresh } : {}),
  });

  return {
    workItemId: workItem.id,
    title: workItem.title,
    // `blocked` when the caller passed a narrowed item: this module is only ever asked about an item that
    // reads blocked on some surface, and the derivation's answer is the one every read surface would give.
    status: entry?.status ?? ("blocked" as const),
    ...(refusal ? { refusal } : {}),
    escalations,
    ...(waitingOn ? { waitingOn } : {}),
    detail,
  };
}

/**
 * Every blocked work item of a project, each with its own sentence — **by the derived status**.
 *
 * The filter is the derivation, not the column, and that is the fix rather than a detail: `reportBlockedWorkItems`
 * filtered `status === "blocked"` on the stored row, so the container `c04462e4` — stored `in_progress`,
 * printed `[blocked]` by `projects show` and by `GET /api/v1/projects/textstats` — was **absent** from
 * `GET /api/v1/projects/textstats/blocked` altogether. A block no report lists is a block no operator can
 * read (BOARD F-089).
 */
export function reportBlockedWorkItemsFromDerivation(
  ctx: BlockedItemExplanationContext,
  projectId: string,
  projectRef: string,
): BlockedWorkItemReport[] {
  const derived = derivedWorkItemStatuses(ctx.pmStore, projectId, pendingEscalationWorkItemIds(ctx));
  return ctx.pmStore
    .listWorkItemsByProject(projectId)
    .filter((item) => derived.get(item.id)?.status === "blocked")
    .map((item) => {
      // `embedChain: false`: every blocked item has an entry here, so a container's sentence points at the
      // item that carries the rule instead of reprinting that item's rule and command under its own id.
      const explanation = explainBlockedWorkItem(ctx, item, projectRef, { derived, embedChain: false });
      return {
        workItemId: item.id,
        title: item.title,
        // The derived status — what the read surfaces render, which is why this item is in the report.
        status: explanation.status,
        ...(explanation.refusal ? { refusal: explanation.refusal } : {}),
        detail: explanation.detail,
      };
    });
}

/** The escalation ids of a project's items, for a caller that wants to hand the derivation its exact set. */
export function pendingEscalationWorkItemIds(
  ctx: Pick<BlockedItemExplanationContext, "blockageStore" | "questionStore">,
): Set<string> {
  return buildPendingEscalationWorkItemIds([
    ...(ctx.questionStore?.listPending() ?? []),
    ...(ctx.blockageStore?.listPending() ?? []),
  ]);
}
