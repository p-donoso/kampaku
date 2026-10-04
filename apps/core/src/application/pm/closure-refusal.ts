/**
 * @module application/pm/closure-refusal
 *
 * **What refused a work item's closure**, as a fact with a handle, instead of a sentence listing causes.
 *
 * Why this module exists. A work item that reads `blocked` had exactly one surface that mentioned it —
 * the project execution gate — and that surface answered with the item's title and the words *"Task is
 * blocked by an error, pending question, or blocker."* Measured 2026-10-01 on suite 08's re-run `s08r9`
 * (BOARD F-088): the leaf `5b240606` had **two succeeded jobs**, `checkResults {lint: true, test: true}`,
 * three evidence records and a completion report in its journal, and its two manual-evidence gates had
 * been answered by the operator through the web UI — while `GET /api/v1/questions?status=pending`
 * returned **0** and `GET /api/v1/blockers` returned **`[]`**. All three named causes were absent, and the
 * real refusal was nowhere on any surface the operator could reach. `kampaku projects step` re-ran the
 * leaf and changed nothing, because a deterministic closure refusal is not a retryable error.
 *
 * What this does. The closure decision already existed in one place (`done-honesty`'s
 * `shouldBlockDishonestSuccess`); this is what makes its answer **legible and dischargeable**:
 *
 * - every refusal carries a **code** (which rule refused), a **field** (what about the work item that rule
 *   read: its checks, its evidence, its criteria, its peer review, its reporting, its audit artifact), the
 *   **rule's own words**, and the **criteria** it was about;
 * - it is written to the work-item journal as a `closure_refused` entry, so it is durable and readable
 *   after the process that decided it has gone;
 * - `clearWith` names the **documented operator command** that clears that code, because a block the
 *   operator cannot clear is a hands-off stop — the property suite 08 scores.
 *
 * Deliberately **not** here: any way to close a work item by declaring it closed. A refusal names what is
 * missing; the discharge answers *that*, and the closure gate still decides.
 *
 * The same requirement was met for risks one layer out (BOARD F-084) by `risk-register.ts`: the gate names
 * the id and the title, the operator reads it, and a disposition clears it. This is that, for closures.
 */

import type { JournalStore } from "../../persistence/journal-store.js";
import type { WorkItemRecord } from "../../persistence/pm-store.js";

/** The journal kind a refusal is recorded as. One entry per refusal, newest wins. */
export const CLOSURE_REFUSAL_JOURNAL_KIND = "closure_refused" as const;

/**
 * Which rule refused the closure.
 *
 * One code per rule in `done-honesty`, so a surface can name the rule instead of paraphrasing it and a
 * test can assert the rule that fired rather than a sentence that happens to be in it.
 */
export type ClosureRefusalCode =
  | "closure_without_checks"
  | "checks_not_run"
  | "checks_failed"
  | "evidence_failed"
  | "evidence_unreferenced"
  | "criteria_without_evidence"
  | "criteria_evidence_insufficient"
  | "manual_review_pending"
  | "manual_review_rejected"
  | "peer_review_required"
  | "reporting_incomplete"
  | "phase_audit_missing"
  | "job_not_settled";

/**
 * What about the work item the rule read.
 *
 * This is the field an operator needs to know *where to look*: `peerReview` means a decision, `checks`
 * means the repository, `acceptanceCriteria` means one criterion, `reporting` means the lead's own records.
 */
export type ClosureRefusalField =
  | "checks"
  | "evidence"
  | "acceptanceCriteria"
  | "peerReview"
  | "reporting"
  | "phaseAudit"
  | "job";

/** What a closure rule decided when it refused. */
export interface ClosureBlock {
  code: ClosureRefusalCode;
  field: ClosureRefusalField;
  /** The rule's own sentence, unchanged — the reason every caller already reported. */
  reason: string;
  /** The criteria the rule was about, when it was about specific ones. */
  criterionIds?: string[];
  /** What is missing or failed, in the rule's own vocabulary. */
  missing?: string[];
}

/** A recorded refusal: the block, plus the item it refused and the command that clears it. */
export interface ClosureRefusal extends ClosureBlock {
  workItemId: string;
  workItemTitle: string;
  projectId: string;
  decidedAt: string;
  /** The documented operator path that clears this code. Runnable as printed. */
  clearWith: string;
}

const CRITERION_CODES: ClosureRefusalCode[] = [
  "criteria_without_evidence",
  "criteria_evidence_insufficient",
  "manual_review_pending",
  "manual_review_rejected",
];

/**
 * The operator command that clears a refusal.
 *
 * Three shapes, and the code decides which:
 *
 * - **A decision only a person can take** (`peer_review_required`) → `kampaku projects closure <item>
 *   --peer --accept`, which records the review the rule asked for, names the operator as the reviewer, and
 *   re-decides the closure against the job that already ran.
 * - **A criterion with no evidence** → the same command scoped to that criterion, which resolves the
 *   criterion's review into evidence and re-decides — the path `manual-evidence-gate` used for the criteria
 *   it chose to gate, now reachable for every criterion.
 * - **The work itself has to be redone** (a failed or missing check, failed evidence, a missing audit
 *   artifact) → `kampaku projects retry <item>`. Retrying is honest here and only here: the refusal is
 *   about what the artifact is, not about a decision nobody has taken. This is why the `s08r9` run's
 *   `projects step` changed nothing — its refusal was the decision shape.
 */
export function clearWithFor(block: Pick<ClosureBlock, "code" | "criterionIds">, workItemId: string): string {
  if (block.code === "peer_review_required") {
    return `kampaku projects closure ${workItemId} --peer --accept --by <who> --notes "<why it passes>"`;
  }
  if (CRITERION_CODES.includes(block.code)) {
    const criterion = block.criterionIds?.[0];
    const scope = criterion ? ` --criterion ${criterion}` : " --criterion <ac-N>";
    return `kampaku projects closure ${workItemId}${scope} --accept --by <who> --notes "<what was checked>"`;
  }
  return `kampaku projects retry ${workItemId}`;
}

/** Builds the refusal for a work item from a closure rule's block. */
export function buildClosureRefusal(
  workItem: Pick<WorkItemRecord, "id" | "title" | "projectId">,
  block: ClosureBlock,
  decidedAt = new Date().toISOString(),
): ClosureRefusal {
  return {
    ...block,
    workItemId: workItem.id,
    workItemTitle: workItem.title,
    projectId: workItem.projectId,
    decidedAt,
    clearWith: clearWithFor(block, workItem.id),
  };
}

/** Records a refusal. Durable, and the newest for a work item is the one that stands. */
export function recordClosureRefusal(
  journalStore: JournalStore | undefined,
  refusal: ClosureRefusal,
): void {
  if (!journalStore) return;
  journalStore.append({
    projectId: refusal.projectId,
    workItemId: refusal.workItemId,
    kind: CLOSURE_REFUSAL_JOURNAL_KIND,
    title: `Closure refused (${refusal.code}): ${refusal.workItemTitle}`,
    body: [
      refusal.reason,
      refusal.missing?.length ? `Missing or failed: ${refusal.missing.join(", ")}.` : "",
      refusal.criterionIds?.length ? `Criteria: ${refusal.criterionIds.join(", ")}.` : "",
      `Clear it with: ${refusal.clearWith}`,
    ]
      .filter(Boolean)
      .join("\n"),
    refType: "work_item",
    refId: refusal.workItemId,
    metadata: {
      code: refusal.code,
      field: refusal.field,
      rule: refusal.reason,
      workItemId: refusal.workItemId,
      workItemTitle: refusal.workItemTitle,
      projectId: refusal.projectId,
      clearWith: refusal.clearWith,
      ...(refusal.criterionIds?.length ? { criterionIds: refusal.criterionIds } : {}),
      ...(refusal.missing?.length ? { missing: refusal.missing } : {}),
      decidedAt: refusal.decidedAt,
    },
    occurredAt: refusal.decidedAt,
  });
}

/** Reads a refusal out of a journal entry, tolerating entries written by an older build. */
export function parseClosureRefusal(
  entry: { metadata: Record<string, unknown>; occurredAt: string } | undefined,
): ClosureRefusal | undefined {
  if (!entry) return undefined;
  const metadata = entry.metadata;
  const code = metadata.code;
  const field = metadata.field;
  const workItemId = metadata.workItemId;
  const workItemTitle = metadata.workItemTitle;
  const rule = metadata.rule;
  const clearWith = metadata.clearWith;
  if (
    typeof code !== "string" ||
    typeof field !== "string" ||
    typeof workItemId !== "string" ||
    typeof workItemTitle !== "string" ||
    typeof rule !== "string" ||
    typeof clearWith !== "string"
  ) {
    return undefined;
  }
  const criterionIds = Array.isArray(metadata.criterionIds)
    ? metadata.criterionIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const missing = Array.isArray(metadata.missing)
    ? metadata.missing.filter((id): id is string => typeof id === "string")
    : undefined;
  return {
    code: code as ClosureRefusalCode,
    field: field as ClosureRefusalField,
    reason: rule,
    workItemId,
    workItemTitle,
    projectId: typeof metadata.projectId === "string" ? metadata.projectId : "",
    decidedAt: entry.occurredAt,
    clearWith,
    ...(criterionIds?.length ? { criterionIds } : {}),
    ...(missing?.length ? { missing } : {}),
  };
}

/**
 * The refusal that stands for a work item: the newest one on record **about that item**.
 *
 * `listAboutWorkItem`, not `listForWorkItem`: the journal anchors a leaf's entries to its container
 * (`JournalStore.resolveAnchorWorkItemId` = `parentId ?? id`), so a container's listing carries its
 * children's entries, and reading one of those as the container's own refusal is how a container came to be
 * reported with its **child's** criterion and its **child's** clearing command, under its own id and title
 * (measured 2026-10-02, suite 08's third run `s08r10`: container `c04462e4` was reported `ac-3` and
 * `kampaku projects closure 9cc7267d …` — its child, already `done` — while the container that actually
 * stopped the line got no sentence at all; BOARD F-089).
 */
export function readLatestClosureRefusal(
  journalStore: JournalStore | undefined,
  workItemId: string,
): ClosureRefusal | undefined {
  if (!journalStore) return undefined;
  const [entry] = journalStore.listAboutWorkItem(workItemId, {
    kinds: [CLOSURE_REFUSAL_JOURNAL_KIND],
    limit: 1,
  });
  return parseClosureRefusal(entry);
}

/**
 * The sentence an operator reads where the old surface listed three absent causes.
 *
 * It names the item, the field, the rule and the command, in that order, because that is the order the
 * operator asks the questions: *which item*, *where do I look*, *what refused it*, *what do I run*.
 */
export function describeClosureRefusal(refusal: ClosureRefusal): string {
  return (
    `Blocked on ${refusal.field} (${refusal.code}): ${refusal.reason} ` +
    `Clear it with: ${refusal.clearWith}`
  );
}

/**
 * A container that reads `blocked`, reported as what it is **waiting on**.
 *
 * A container's block is never its own closure rule: `decideWorkItemClosure` decides a container against
 * its own settled job, which is a different question, so an operator who runs the container's discharge
 * gets a decision about the wrong thing. What stops the line is the child, and naming it — with the
 * child's rule and the child's command, which the caller passes in as `waitingOnDetail` — is the only
 * sentence a container's block can honestly carry (BOARD F-089).
 */
export function describeContainerBlock(input: {
  container: Pick<WorkItemRecord, "id" | "title">;
  waitingOn: { workItemId: string; title: string };
  /**
   * The waiting-on item's own sentence, when the caller has no separate entry for that item.
   *
   * A caller that **reports the whole project** leaves this out: the waiting-on item is blocked, so it has an
   * entry of its own with its own rule and its own command there, and reprinting them under the container's id
   * is how the container came to be read as the item the decision belonged to — the smallest leg of this row,
   * fixed 2026-10-02 (`13dee64`), locked in `eval-closure-block-legibility.test.ts`.
   */
  waitingOnDetail?: string;
  /** The project slug, for the pointer at where the rule is printed. */
  projectRef?: string;
}): string {
  const pointer = input.waitingOnDetail
    ? input.waitingOnDetail
    : `It is listed with its own rule and the command that clears it` +
      (input.projectRef ? ` — read them with: kampaku projects blocked ${input.projectRef}` : "");
  return (
    `"${input.container.title}" (${input.container.id.slice(0, 8)}) is blocked and has no closure rule of ` +
    `its own: it is waiting on "${input.waitingOn.title}" (${input.waitingOn.workItemId.slice(0, 8)}). ` +
    pointer
  );
}

/**
 * An item that reads `blocked` with nothing of its own behind it and a block above it.
 *
 * The block is not this item's — nothing about it refused any rule — so the sentence has to say that, or it
 * reads as a rule the operator cannot find. `describeUnrecordedBlock` said *"no closure decision naming the
 * rule is on record for it"* about items in exactly this state (measured 2026-10-02 on run `s08r10`:
 * `593b665a` and `2edbed14` were blocked by `blockWorkItemAndDescendants` when a blocker was raised against
 * their container, and had no record of anything of their own).
 *
 * The item named is the ancestor that **carries** the block (the caller resolves it), which is why the
 * sentence says "above" rather than "its container": the carrier is often a grandparent, and on the measured
 * tree it was — the nearest blocked ancestor was the very item this one blocks.
 */
export function describeInheritedBlock(input: {
  workItem: Pick<WorkItemRecord, "id" | "title">;
  /** The ancestor that carries the block. */
  carrier: Pick<WorkItemRecord, "id" | "title">;
  /** The carrier's own sentence; omitted when the carrier has an entry of its own beside this one. */
  carrierDetail?: string;
  /** The project slug, for the pointer at where the rule is printed. */
  projectRef?: string;
}): string {
  const pointer = input.carrierDetail
    ? input.carrierDetail
    : `That item carries the rule and the command that clears it` +
      (input.projectRef ? ` — read them with: kampaku projects blocked ${input.projectRef}` : "");
  return (
    `"${input.workItem.title}" (${input.workItem.id.slice(0, 8)}) is blocked and nothing of its own refused ` +
    `it: the block is above it, on "${input.carrier.title}" (${input.carrier.id.slice(0, 8)}). ` +
    pointer
  );
}

/** One escalation raised against a work item: a blocker or a question, both of which freeze it. */
export interface PendingEscalation {
  id: string;
  kind: "blocker" | "question";
  /** Who the escalation is waiting on — the `--by` the clearing command needs. */
  heldBy: string;
  /** The escalation's own words, one line. */
  description: string;
}

/**
 * The operator command that clears one escalation.
 *
 * Two shapes, one per kind, and each is runnable as printed: a blocker is resolved through the documented
 * blocker surface (which resumes the work item it froze), a question is answered.
 */
export function clearWithForEscalation(escalation: PendingEscalation): string {
  return escalation.kind === "blocker"
    ? `kampaku blockers resolve ${escalation.id} --by ${escalation.heldBy} --resolution "<what was decided>"`
    : `kampaku questions answer ${escalation.id} "<the decision>"`;
}

/**
 * An item that reads `blocked` because an escalation is open against it.
 *
 * This is the sentence the container `8419cdbd` needed on run `s08r10` and did not get: two blockers were
 * pending against it (`263514fb`, `c4880c7a`), both held by the operator's own desk, and every surface said
 * only *"no closure decision naming the rule is on record for it"* — a rule it never had, while the two
 * records that did stop it were named nowhere and clearable by nothing the operator held (BOARD F-089).
 *
 * `resumeWorkItemIfClear` is what makes the command above change the state: clearing the escalation resumes
 * the item it froze, and — when it had been frozen from `todo` — rolls the derived status back up its
 * ancestors.
 */
export function describePendingEscalationBlock(item: Pick<WorkItemRecord, "id" | "title">, escalations: PendingEscalation[]): string {
  const named = escalations.map((escalation) =>
    `${escalation.kind} ${escalation.id.slice(0, 8)} ("${escalation.description}", held by ${escalation.heldBy})`,
  );
  const [, ...rest] = escalations;
  return (
    `"${item.title}" (${item.id.slice(0, 8)}) is blocked by ${escalations.length} pending ` +
    `escalation${escalations.length === 1 ? "" : "s"} raised against it: ${named.join(", ")}. ` +
    `Clear it with: ${clearWithForEscalation(escalations[0])}` +
    (rest.length > 0 ? ` (each escalation clears only its own; ${rest.length} more to go)` : "")
  );
}

/**
 * A block nothing accounts for: no closure rule on the item, none above it, no pending escalation anywhere
 * in its chain.
 *
 * The fourth reason a work item reads `blocked` (see `application/pm/block-release.ts`), and the only one
 * that needs a sentence of its own, because the other three all print a command. Measured 2026-10-02 on run
 * `s08r10`: the leaves `593b665a` and `2edbed14` were left `blocked` by a freeze of their container that
 * recorded nothing, and every read surface said *"no closure decision naming the rule is on record for it"* —
 * a rule that does not exist, on an item no command could move, while the container above them read blocked
 * **because of them** (BOARD F-089).
 */
export function describeUnaccountedBlock(input: {
  workItem: Pick<WorkItemRecord, "id" | "title">;
  /** The ancestor that is blocked with it, when the two hold each other up. */
  circularWith?: Pick<WorkItemRecord, "id" | "title">;
}): string {
  const circular = input.circularWith
    ? ` It and "${input.circularWith.title}" (${input.circularWith.id.slice(0, 8)}) hold each other blocked: ` +
      `each reads blocked because the other does, and neither names a rule.`
    : "";
  return (
    `"${input.workItem.title}" (${input.workItem.id.slice(0, 8)}) is blocked and nothing accounts for it: ` +
    `no closure rule on it, none above it, and no pending escalation anywhere in its chain.${circular} ` +
    `Release it, naming who takes the decision: kampaku projects release ${input.workItem.id} --by <who> ` +
    `--notes "<what was checked>"`
  );
}

/** The same sentence with the item named, for a surface that is not already about one item. */
export function describeClosureRefusalWithItem(refusal: ClosureRefusal): string {
  return `"${refusal.workItemTitle}" (${refusal.workItemId.slice(0, 8)}): ${describeClosureRefusal(refusal)}`;
}

/**
 * What an item that reads `blocked` gets when no refusal is on record for it.
 *
 * There are two reasons this happens, and they need different sentences:
 *
 * - **The settled job now satisfies every rule.** The item was blocked by a rule that no longer refuses it
 *   — the blocking condition was withdrawn, a false positive was corrected, or the block predates this
 *   record. Re-deciding costs nothing and spends no job, so that is what the sentence says. This is the
 *   measured state of the `s08r9` specimen under the rules that now stand.
 * - **Nothing has decided it yet.** The item is blocked by something that is not a closure refusal — a
 *   question it waits on, a blocker, a failed job, another session's edit. The sentence says what it knows
 *   and points at the surface that lists the item's own records, rather than inventing a cause.
 */
export function describeReDecidableBlock(
  item: Pick<WorkItemRecord, "id" | "title">,
): string {
  return (
    `"${item.title}" (${item.id.slice(0, 8)}) is blocked and its settled job satisfies every closure rule ` +
    `that now stands. Re-decide it, without spending a job: kampaku projects closure ${item.id}`
  );
}

export function describeUnrecordedBlock(
  item: Pick<WorkItemRecord, "id" | "title">,
  projectRef: string,
): string {
  return (
    `"${item.title}" (${item.id.slice(0, 8)}) is blocked and no closure decision naming the rule is on ` +
    `record for it. Read the item's own records with: kampaku projects blocked ${projectRef}`
  );
}

/** What a fresh closure decision says about a blocked item that has no refusal on record. */
export type UnrecordedBlockVerdict =
  /** The rules as they stand would close the item. */
  | { verdict: "would_close" }
  /** The rules still refuse it: the block, as they would decide it now. */
  | { verdict: "refused"; block: ClosureBlock }
  /** No settled job of this item has a result to decide against. */
  | { verdict: "no_settled_job" };

/**
 * The read surface: the same sentence the gate would give the item, for a surface that must not decide.
 *
 * `refusal` is what the journal holds; `fresh` is what the rules would say now, computed without writing
 * anything. The recorded refusal wins when there is one — it is the decision that actually blocked the
 * item — and the fresh verdict is how an item blocked before this record existed still gets named a rule
 * instead of a shrug.
 */
export function describeBlockedItem(input: {
  workItem: Pick<WorkItemRecord, "id" | "title" | "projectId">;
  refusal?: ClosureRefusal;
  /**
   * Escalations open against this item. The reason its own closure rule cannot decide it, and the reason
   * the item reads `blocked` before any rule has run: a blocker or a question freezes the item it is raised
   * against (`blockWorkItemAndDescendants`), so "no closure decision on record" is true and useless.
   */
  escalations?: PendingEscalation[];
  /**
   * For a container: the child that carries the block, and that child's own sentence **when the caller has no
   * entry for it** (the report does have one, and passes nothing here).
   */
  waitingOn?: { workItemId: string; title: string; detail?: string };
  /** For an item blocked with nothing of its own: the ancestor that carries the block, and its sentence. */
  inheritedFrom?: { workItemId: string; title: string; detail?: string };
  /**
   * For an item blocked with nothing of its own **and** nothing above it that carries a block either — the
   * block no record accounts for. Naming the ancestor it holds blocked makes the circle visible instead of
   * printing the same clause twice.
   */
  unaccountedWith?: { workItemId: string; title: string };
  /** The caller resolved the chain and found nothing that accounts for this block. */
  unaccounted?: true;
  projectRef: string;
  fresh?: UnrecordedBlockVerdict;
}): string {
  if (input.refusal) return describeClosureRefusalWithItem(input.refusal);
  if (input.escalations?.length) {
    return describePendingEscalationBlock(input.workItem, input.escalations);
  }
  // A container before an inherited container: an item that *is* the container the block sits on must say
  // what it waits on, not that it is subordinate to something above it.
  if (input.waitingOn) {
    return describeContainerBlock({
      container: input.workItem,
      waitingOn: input.waitingOn,
      ...(input.waitingOn.detail ? { waitingOnDetail: input.waitingOn.detail } : {}),
      projectRef: input.projectRef,
    });
  }
  if (input.unaccountedWith || input.unaccounted) {
    return describeUnaccountedBlock({
      workItem: input.workItem,
      ...(input.unaccountedWith
        ? { circularWith: { id: input.unaccountedWith.workItemId, title: input.unaccountedWith.title } }
        : {}),
    });
  }
  if (input.inheritedFrom) {
    return describeInheritedBlock({
      workItem: input.workItem,
      carrier: { id: input.inheritedFrom.workItemId, title: input.inheritedFrom.title },
      ...(input.inheritedFrom.detail ? { carrierDetail: input.inheritedFrom.detail } : {}),
      projectRef: input.projectRef,
    });
  }
  if (input.fresh?.verdict === "refused") {
    return `"${input.workItem.title}" (${input.workItem.id.slice(0, 8)}): ${describeClosureRefusal(
      buildClosureRefusal(input.workItem, input.fresh.block),
    )}`;
  }
  if (input.fresh?.verdict === "would_close") return describeReDecidableBlock(input.workItem);
  return describeUnrecordedBlock(input.workItem, input.projectRef);
}

/** One blocked work item as the read surface reports it. */
export interface BlockedWorkItemReport {
  workItemId: string;
  title: string;
  status: string;
  /** The refusal that stands, when the journal holds one. */
  refusal?: ClosureRefusal;
  /** The sentence the operator reads. Never a list of possible causes. */
  detail: string;
}

/**
 * Every blocked work item of a project, each with its own sentence.
 *
 * The gate names only the **head** blocking leaf, because that is what stops the line; an operator looking
 * at a project with four blocked leaves needs all four named, with the same sentence the gate would give
 * each. `fresh` is the caller's read-only closure decision, so an item blocked before this record existed
 * is still given a rule rather than a shrug.
 */
export function reportBlockedWorkItems(input: {
  workItems: Array<Pick<WorkItemRecord, "id" | "title" | "projectId" | "status">>;
  journalStore?: JournalStore;
  projectRef: string;
  fresh?: (item: Pick<WorkItemRecord, "id" | "title" | "projectId">) => UnrecordedBlockVerdict | undefined;
}): BlockedWorkItemReport[] {
  return input.workItems
    .filter((item) => item.status === "blocked")
    .map((item) => {
      const refusal = readLatestClosureRefusal(input.journalStore, item.id);
      const fresh = refusal ? undefined : input.fresh?.(item);
      return {
        workItemId: item.id,
        title: item.title,
        status: item.status,
        ...(refusal ? { refusal } : {}),
        detail: describeBlockedItem({ workItem: item, refusal, fresh, projectRef: input.projectRef }),
      };
    });
}
