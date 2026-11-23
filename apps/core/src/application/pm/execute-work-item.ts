import type { AppConfig, RepositoryRole } from "../../config.js";
import { createGoalWithPlan } from "../../planner/create-goal.js";
import { deriveFrozenPaths } from "../../delegator/plan-validation.js";
import { inferReadOnlyJob } from "./deliverable-requirements.js";
import { dispatchRequiredChecks, expectsFailingCheck } from "./leaf-checks.js";
import { baselineBefore, type BaselineObservation } from "./baseline-checks.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { SkillStore } from "../../persistence/skill-store.js";
import type { Store, JobResultRecord } from "../../persistence/store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { BlockageStore } from "../../persistence/blockage-store.js";
import { recordCompletionReportJournal, recordCompletionAgentMemory, type CompletionRecipientContext } from "./journal-events.js";
import { buildPostActionRuntime, recordPostActionLifecycle } from "./post-action/index.js";
import {
  evaluateJobCheckResults,
  inferRequiredChecksFromWorkItem,
} from "./work-item-checks.js";
import { linkedFileCheckout } from "../../delegator/check-validation.js";
import { runPhaseCompletionHooks } from "./phase-completion-hook.js";
import { ensurePhaseAuditorAfterLeafDone, phaseGateOwesNoFiles } from "./phase-auditor-gate.js";
import { formatAcceptanceCriteriaForWorker } from "./acceptance-criteria.js";
import { shouldBlockDishonestSuccess } from "./done-honesty.js";
import {
  buildClosureRefusal,
  recordClosureRefusal,
  type ClosureBlock,
  type ClosureRefusal,
} from "./closure-refusal.js";
import {
  manualEvidenceBlockDetail,
  openManualEvidenceGates,
  resolveManualEvidenceFromAnswer,
} from "./manual-evidence-gate.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import { ensureLeafSplitWorkItem, isOverweightLeaf } from "./leaf-splitter.js";
import { recallLearningsForJob } from "./job-memory.js";
import {
  resolveProjectJobContext,
  type ProjectJobContext,
} from "./project-repository.js";
import {
  canExecuteLeaf,
  collectLeavesInOrder,
  isReleasableUnderBlockedContainer,
} from "./work-item-order.js";
import { getProjectExecutionGate } from "./project-execution-gate.js";
import { rollupDerivedStatusForItemAndAncestors } from "./work-item-parent-rollup.js";

export class ExecuteWorkItemError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT",
  ) {
    super(message);
    this.name = "ExecuteWorkItemError";
  }
}

export interface ExecuteWorkItemContext {
  store: Store;
  pmStore: PmStore;
  agentStore: AgentStore;
  skillStore: SkillStore;
  config: AppConfig;
  memoryStore?: MemoryStore;
  /**
   * What a release refusal reads to explain itself — see `CanExecuteReadContext`.
   *
   * Optional because old callers predate them, and their absence degrades the **sentence**, never the
   * decision: an item with a refusal on record is still refused without the journal, it is only described as
   * an unrecorded block (BOARD F-089, where `execute_work_item` refused a leaf over a container whose own
   * child held a readable refusal and named no rule at all).
   */
  journalStore?: JournalStore;
  blockageStore?: BlockageStore;
  questionStore?: QuestionStore;
}

export interface ExecuteWorkItemResult {
  workItemId: string;
  goalId?: string;
  jobId?: string;
  objective: string;
  repositoryRole?: RepositoryRole;
}

/**
 * Whether the factory can actually run this work, asked of the executor rather than of the assignee.
 *
 * The check this replaces asked the **assignee's skill catalog** whether a **worker** could carry code
 * work, and those are not the same question. Measured 2026-09-29 while opening suite 08 (BOARD F-075): a
 * work order opened exactly the way the product documents it — the lead through `POST /api/v1/agents`, the
 * container through `POST /api/v1/projects` naming that lead — answered `POST
 * /api/v1/projects/<slug>/play` with **400 `Assignee agent lacks code.agent capability from assigned
 * skills.`** The lead holds the default set (`system-chat-format`, `system-plan-quality`, the thirteen
 * `workflow-*`), and `code.agent` is carried only by the *dev-shaped* catalog skills (`qa-testing`,
 * `nextjs-dev`, `api-integration`, …), none of which is a default. So the one path the product instructs
 * could never release a leaf for execution, and the check was backwards as well: it **exempted a seat with
 * zero skills** and refused one holding the default set, which is the more capable of the two.
 *
 * The work is done by a registered worker, and Core already knows what a worker can lease: `leaseNextJob`
 * matches the job's required capabilities against the worker's own registered list. So this asks that
 * question, before the job is queued, so the operator gets a sentence instead of a job that sits queued
 * forever. `createGoalWithPlan` gives every project job the requirement `code.agent`.
 *
 * Two deliberate properties, both of them about not trading one wrong refusal for another: a seat's skills
 * are **not** consulted, because what a seat holds has no bearing on what the executor can do; and an
 * instance with **no** worker registered is not refused, because a headless Core is a legitimate way to
 * plan and release work — the job waits, which is what a queue is for. The refusal is for the case where
 * workers exist and none of them can take the job, which is a real misconfiguration and names itself.
 */
const PROJECT_JOB_CAPABILITIES = ["code.agent"];

function assertWorkCanBeLeased(ctx: ExecuteWorkItemContext): void {
  const workers = ctx.store.listWorkers();
  if (workers.length === 0) return;

  const canLease = workers.some((worker) =>
    PROJECT_JOB_CAPABILITIES.every((capability) => worker.capabilities.includes(capability)),
  );
  if (canLease) return;

  throw new ExecuteWorkItemError(
    "No registered worker can execute this work: a project job requires the capability " +
      `${PROJECT_JOB_CAPABILITIES.map((capability) => `"${capability}"`).join(", ")}, and the ` +
      `${workers.length} registered worker(s) declare ${workers
        .flatMap((worker) => worker.capabilities)
        .map((capability) => `"${capability}"`)
        .join(", ")}. Start a worker that registers it (scripts/start.sh) and check ` +
      "GET /api/v1/runtime/status.",
    "VALIDATION",
  );
}

function buildObjective(title: string, description?: string, acceptanceCriteria: string[] = []): string {
  const parts = [title];
  if (description?.trim()) parts.push(description.trim());
  if (acceptanceCriteria.length > 0) {
    parts.push("Acceptance criteria:");
    for (const criterion of formatAcceptanceCriteriaForWorker(acceptanceCriteria)) parts.push(`- ${criterion}`);
  }
  return parts.join("\n\n");
}

function resolveRepositoryRole(
  projectSlug: string,
  repositories: Array<{ url: string; role?: string }>,
): RepositoryRole {
  return resolveProjectJobContext({
    id: "",
    slug: projectSlug,
    name: projectSlug,
    status: "active",
    repositories,
    createdAt: "",
    updatedAt: "",
  }).repositoryRole;
}

export { resolveProjectJobContext, type ProjectJobContext };

export async function executeWorkItem(
  ctx: ExecuteWorkItemContext,
  workItemId: string,
): Promise<ExecuteWorkItemResult> {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) {
    throw new ExecuteWorkItemError("Work item not found.", "NOT_FOUND");
  }

  const children = ctx.pmStore
    .listWorkItemsByProject(workItem.projectId)
    .filter((item) => item.parentId === workItem.id);
  if (children.length > 0) {
    throw new ExecuteWorkItemError("Container tasks cannot be executed directly.", "VALIDATION");
  }

  if (isOverweightLeaf(workItem)) {
    ensureLeafSplitWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, workItem);
    const slices = ctx.pmStore
      .listWorkItemsByProject(workItem.projectId)
      .filter((item) => item.parentId === workItem.id && item.status === "todo")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (slices[0]) {
      return executeWorkItem(ctx, slices[0].id);
    }
  }

  if (workItem.status === "in_progress" && workItem.goalId) {
    throw new ExecuteWorkItemError("Work item is already executing.", "CONFLICT");
  }

  if (workItem.status === "done") {
    throw new ExecuteWorkItemError("Work item is already done.", "CONFLICT");
  }

  const projectItems = ctx.pmStore.listWorkItemsByProject(workItem.projectId);
  const tree = ctx.pmStore.buildWorkItemTree(projectItems);
  const orderedLeaves = collectLeavesInOrder(tree);
  const eligibility = canExecuteLeaf(workItem, orderedLeaves, projectItems, ctx.pmStore, {
    journalStore: ctx.journalStore,
    blockageStore: ctx.blockageStore,
    questionStore: ctx.questionStore,
    agentStore: ctx.agentStore,
  });
  if (!eligibility.ok) {
    throw new ExecuteWorkItemError(eligibility.reason, "VALIDATION");
  }

  const project = ctx.store.getProject(workItem.projectId);
  if (!project) {
    throw new ExecuteWorkItemError("Project not found.", "NOT_FOUND");
  }

  const projectContext = resolveProjectJobContext(project, workItemId);
  const objective = buildObjective(
    workItem.title,
    workItem.description,
    workItem.acceptanceCriteria,
  );
  // The plan's freeze, in the form a tool can enforce.
  //
  // Derived from the item's own words as well as from what it declares, so this covers the plans that already
  // exist and the planners that never heard of `frozen_paths`. Measured 2026-10-04 on suite 08's fourth re-run
  // (BOARD F-098, F-099): a plan froze two files in prose, nothing read that sentence, and the job that ran
  // repaired a failing check by writing to one of them while the platform reported success. Handing the set to
  // the worker's write boundary is what makes the freeze a constraint rather than an expectation.
  const frozenPaths = deriveFrozenPaths({
    title: workItem.title,
    description: workItem.description,
    acceptanceCriteria: workItem.acceptanceCriteria,
    declared: workItem.frozenPaths,
  });

  assertWorkCanBeLeased(ctx);

  // **A pending gate stops dispatch here too.**
  //
  // `playProject` and `stepProject` consult the project execution gate; this path — the tool a lead calls to
  // release a leaf — did not, so the operator's own surfaces respected a pending gate while the seat that
  // queues jobs did not. Measured 2026-10-19 on suite 05's run `s05r3`: the intake turn applied an eight-item
  // plan and asked *"How should the intent-demo plan be released once you are satisfied with it?"*; the next
  // prompt, `Start now`, queued **two jobs** against L1 with that gate still pending, one of which succeeded
  // and wrote into the fixture. The suite's oracle is that no job starts from any of its prompts.
  //
  // The escape hatches stay open: a blocker triage, a leaf split and a phase-auditor gate exist to clear a
  // block, so they are releasable under one (see `isReleasableUnderBlockedContainer`), and refusing them here
  // would trade one deadlock for another.
  if (!isReleasableUnderBlockedContainer(workItem)) {
    const gate = getProjectExecutionGate({
      pmStore: ctx.pmStore,
      projectId: workItem.projectId,
      questionStore: ctx.questionStore,
      blockageStore: ctx.blockageStore,
      journalStore: ctx.journalStore,
      agentStore: ctx.agentStore,
    });
    if (gate.gated) {
      throw new ExecuteWorkItemError(
        `Nothing was queued: the project's execution gate is closed (${gate.reason}). ${gate.detail ?? ""}`.trim(),
        "VALIDATION",
      );
    }
  }

  const { goal, jobId } = await createGoalWithPlan(ctx.store, ctx.config, {
    projectId: project.id,
    objective,
    priority: workItem.priority,
    repositoryRole: projectContext.repositoryRole,
    projectContext,
    memoryContext: recallLearningsForJob(ctx.memoryStore, workItem),
    // A phase gate on somebody else's repository owes no file: its verdict goes in the completion report, which
    // the platform keeps. The item's own description says so and the job was failed for obeying it — measured
    // 2026-11-23 on `s19r20` (`WORKER_NO_DELIVERABLES`).
    ...(phaseGateOwesNoFiles(workItem, project.slug) ? { observationOnly: true } : {}),
    // What this leaf *is*, read from its title and description only — never from the wording of its evidence
    // (`resolveJobWritingPolicy`, suite 19 `s19r22`).
    leafProse: [workItem.title, workItem.description ?? ""].filter(Boolean).join("\n\n"),
    plannedTask: {
      title: workItem.title,
      prompt: objective,
      repositoryRole: projectContext.repositoryRole,
      acceptanceCriteria: workItem.acceptanceCriteria,
      frozenPaths,
    },
  });

  ctx.pmStore.updateWorkItem(workItemId, {
    status: "in_progress",
    goalId: goal.id,
    jobId,
  });

  return {
    workItemId,
    goalId: goal.id,
    jobId,
    objective,
    repositoryRole: projectContext.repositoryRole,
  };
}

export async function retryWorkItem(
  ctx: ExecuteWorkItemContext,
  workItemId: string,
): Promise<ExecuteWorkItemResult> {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) {
    throw new ExecuteWorkItemError("Work item not found.", "NOT_FOUND");
  }

  const children = ctx.pmStore
    .listWorkItemsByProject(workItem.projectId)
    .filter((item) => item.parentId === workItem.id);
  if (children.length > 0) {
    throw new ExecuteWorkItemError("Container tasks cannot be retried directly.", "VALIDATION");
  }

  if (workItem.status !== "blocked") {
    throw new ExecuteWorkItemError("Only blocked tasks can be retried.", "VALIDATION");
  }

  ctx.pmStore.updateWorkItem(workItemId, {
    status: "todo",
    goalId: undefined,
    jobId: undefined,
  });

  return executeWorkItem(ctx, workItemId);
}

/**
 * Records the post-action review for an execution outcome.
 *
 * Automated reviews use the deterministic projection path so a provider outage
 * can never block closure bookkeeping. Failures surface as projection statuses.
 */
function recordWorkPostAction(
  stores: {
    pmStore: PmStore;
    agentStore?: AgentStore;
    journalStore?: JournalStore;
    memoryStore?: MemoryStore;
    store?: Store;
    wikiStore?: CompletionRecipientContext["wikiStore"];
    reviewStore?: CompletionRecipientContext["postActionStore"];
  },
  workItem: WorkItemRecord,
  jobId: string,
  result: JobResultRecord | undefined,
  event: "work_completed" | "work_failed",
  agentId?: string,
): void {
  if (!stores.agentStore || !stores.reviewStore) return;
  const output = result?.output && typeof result.output === "object"
    ? (result.output as Record<string, unknown>)
    : {};
  const fileList = Array.isArray(output.filesChanged)
    ? output.filesChanged.filter((entry): entry is string => typeof entry === "string")
    : [];
  const checkResults = output.checkResults && typeof output.checkResults === "object"
    ? Object.entries(output.checkResults as Record<string, unknown>)
    : [];
  const failureMessage = result?.error && typeof result.error === "object"
    ? String((result.error as Record<string, unknown>).message ?? "")
    : typeof result?.error === "string"
      ? result.error
      : "";

  recordPostActionLifecycle(
    buildPostActionRuntime({
      pmStore: stores.pmStore,
      agentStore: stores.agentStore,
      reviewStore: stores.reviewStore,
      store: stores.store,
      journalStore: stores.journalStore,
      memoryStore: stores.memoryStore,
      wikiStore: stores.wikiStore,
    }),
    {
      event,
      projectId: workItem.projectId,
      agentId,
      workItemId: workItem.id,
      referenceId: jobId,
      summary: [
        `${event === "work_completed" ? "Completed" : "Failed"} "${workItem.title}" (job ${jobId}).`,
        typeof output.summary === "string" ? output.summary : "",
        failureMessage ? `Error: ${failureMessage}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      files: fileList,
      checks: checkResults.map(([script, ok]) => `${script}: ${ok === true ? "pass" : "fail"}`),
      acceptanceCriteria: workItem.acceptanceCriteria,
      wikiSyncRequired: stores.store?.getProject(workItem.projectId)?.wikiSyncRequired === true,
    },
  );
}

/**
 * The closure context for an answered human gate.
 *
 * Same shape as the stores a job completion carries, minus the stores the completion path uses to *record*
 * a completion: reconciling an answer writes a decision, never a second completion report.
 */
export interface ReconciliationContext {
  store: Store;
  pmStore: PmStore;
  journalStore?: JournalStore;
  memoryStore?: MemoryStore;
  completionCtx?: CompletionRecipientContext;
}

/**
 * Re-evaluates the closure of a blocked work item against the job result already on record.
 *
 * This is what an answered human gate calls. The evidence for the work is not re-produced: the job that
 * did the work already ran, its result is stored, and the only thing that changed is a decision. Spending
 * a second job to re-run checks whose output is already in the journal is the failure mode BOARD F-077
 * recorded — *"the failure mode of a dishonest-success gate is to spend more, not to stop"*.
 *
 * Returns the status the work item ended in, so the caller can report what the answer did.
 */
export function reevaluateBlockedWorkItemClosure(
  ctx: ReconciliationContext,
  workItemId: string,
): { status: WorkItemRecord["status"]; reason?: string; refusal?: ClosureRefusal } | undefined {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) return undefined;
  // Not `status === "blocked"`: answering a question resumes the work item it had paused, so by the time this
  // runs the status is the one from before the gate. What makes a work item reconcilable is that it is open
  // and that a job of its own succeeded — the closure decision below is the same one the completion path
  // makes, and it is the decision, not the status, that says whether the work is done.
  if (workItem.status === "done" || workItem.status === "cancelled") return undefined;

  // Which job did the work is read from the journal, not from the work item's own `jobId`: answering a
  // question resumes the item through `resumeWorkItemIfClear`, which clears the pointer it had parked, so
  // by the time the answer arrives the item no longer names the job whose result is the evidence. The
  // completion report is the durable record that names it, and it is the same record the report itself was
  // built from.
  const jobId = latestCompletedJobId(ctx.journalStore, workItem.id) ?? workItem.jobId;
  if (!jobId) return undefined;

  const job = ctx.store.getJob(jobId);
  const result = ctx.store.getJobResult(jobId);
  if (!job || job.status !== "succeeded" || !result) return undefined;

  const outcome = attemptWorkItemClosure(
    ctx.pmStore,
    ctx.journalStore,
    workItem,
    jobId,
    result,
    ctx.memoryStore,
    ctx.completionCtx,
  );
  return { status: outcome.closed ? "done" : "blocked", reason: outcome.reason, refusal: outcome.refusal };
}

/** The most recent job whose completion was recorded for this work item. */
function latestCompletedJobId(
  journalStore: JournalStore | undefined,
  workItemId: string,
): string | undefined {
  if (!journalStore) return undefined;
  // `listForWorkItem` carries a container's children — that is what the anchor is for — so the entry has to be
  // checked against the item it is *about*. Without this a container's job is its child's job: measured 2026-11-09 on
  // suite 19 run `s19r17`, where `projects blocked` decided the Phase R container against L1's settled job and
  // reported it `evidence_failed: test` — the child's finding, under the container's id, with a clearing command
  // (`retry <container>`) the platform refuses because a container cannot be retried.
  const entries = journalStore.listForWorkItem(workItemId, {
    kinds: ["completion_report"],
    limit: 50,
  });
  const latest = entries
    .filter((entry) => entry.workItemId === workItemId)
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .at(-1);
  return latest?.refType === "job" ? latest.refId : undefined;
}

/**
 * Turns an answer to a manual-evidence gate into an accepted or rejected decision, then closes the leaf if
 * the decision was the only thing missing.
 *
 * Answers arrive through the questions route — the web card, the CLI, or the HTTP API — and that route has
 * no reason to know about criteria. This is the one place the two meet, and it is deliberately the only
 * caller of `resolveManualEvidenceFromAnswer`.
 */
export function applyAnsweredManualEvidence(
  ctx: ReconciliationContext & { questionStore?: QuestionStore },
  input: { questionText: string; answer: string; answeredByAgentId?: string; workItemId?: string },
): { resolved: number; workItemStatus?: WorkItemRecord["status"]; reason?: string; refusal?: ClosureRefusal } {
  const resolved = resolveManualEvidenceFromAnswer({
    journalStore: ctx.journalStore,
    questionText: input.questionText,
    answer: input.answer,
    answeredByAgentId: input.answeredByAgentId,
    workItemId: input.workItemId,
  });
  if (resolved.length === 0 || !input.workItemId) return { resolved: resolved.length };

  const outcome = reevaluateBlockedWorkItemClosure(ctx, input.workItemId);
  return {
    resolved: resolved.length,
    workItemStatus: outcome?.status,
    reason: outcome?.reason,
    refusal: outcome?.refusal,
  };
}

/**
 * The closure decision for a succeeded job, read without changing anything.
 *
 * One implementation for the two callers that must agree: the completion path (which then applies it) and
 * a read surface that has to name the rule for an item blocked before the refusal was recorded (which
 * must not apply it). Whether a work item is done is one question with one answer.
 */
/**
 * The checks a work item's closure requires, read exactly as the dispatch read them.
 *
 * **One reading, or the two disagree about one job.** A job dispatched read-only carries no check to turn green; if
 * the closure re-derives a check from the leaf's prose it refuses that job for not turning it green, and the leaf can
 * never close by any means it is allowed. Measured 2026-11-23 on suite 19 run `s19r22`: the Phase 1 audit gate on an
 * external checkout ran read-only, recorded its rubric and the red runner it sampled, and was refused
 * `checks_not_run: Required checks not run: test` — its own criterion (`./run-tests.sh exits 0`) naming a runner it
 * may not write to.
 *
 * `dispatchRequiredChecks` is the function the dispatch uses, so calling it here is what makes the two the same
 * reading rather than two readings that happen to agree today.
 */
export function closureRequiredChecksFor(
  workItem: WorkItemRecord,
  checkoutPath?: string,
  projectSlug?: string,
): string[] {
  return dispatchRequiredChecks(
    {
      title: workItem.title,
      description: workItem.description ?? undefined,
      acceptanceCriteria: workItem.acceptanceCriteria as unknown as string[],
      readOnly: phaseGateOwesNoFiles(workItem, projectSlug),
    },
    checkoutPath,
  );
}

function decideClosureAgainstJob(
  pmStore: PmStore,
  journalStore: JournalStore | undefined,
  workItem: WorkItemRecord,
  result: JobResultRecord,
  memoryStore: MemoryStore | undefined,
  completionCtx?: CompletionRecipientContext,
  checkoutPath?: string,
  /**
   * What was already red before this job ran (`baseline-checks.ts`), read by the caller that holds the store.
   *
   * The closure needs a before to tell a regression from the state the job was sent into; without one it applies the
   * stricter reading, which is the safe direction and the one `eval 14/24` states.
   */
  baseline?: BaselineObservation,
): { outcome: "closed" } | { outcome: "refused"; block: ClosureBlock } {
  // The checks this leaf must pass, read with the checkout in hand: a leaf whose criteria name a member of the
  // repository's own runner is judged on that member, and the aggregate belongs to the plan's verification leaf
  // (`leaf-checks.ts`, suite 19 run `s19r7`). Unknown checkout -> the neutral reading, unchanged.
  const requiredChecks = closureRequiredChecksFor(
    workItem,
    checkoutPath,
    completionCtx?.store?.getProject(workItem.projectId)?.slug,
  );
  const output = result.output && typeof result.output === "object"
    ? (result.output as Record<string, unknown>)
    : {};
  const checkEval = evaluateJobCheckResults(
    requiredChecks,
    output.checkResults as Record<string, unknown> | undefined,
  );

  const assigneeMemory = workItem.assigneeAgentId && memoryStore
    ? memoryStore.list({ agentId: workItem.assigneeAgentId, kind: "log", projectId: workItem.projectId, limit: 100 })
      .some((memory) => memory.workItemId === workItem.id)
    : false;
  const journalEntries = journalStore?.listForWorkItem(workItem.id) ?? [];
  const honesty = shouldBlockDishonestSuccess(
    workItem,
    result,
    journalEntries,
    {
      completionReport: journalEntries.some((entry) => entry.kind === "completion_report"),
      privateMemory: assigneeMemory,
      wikiSync: completionCtx?.store?.getProject(workItem.projectId)?.wikiSyncRequired === true
        ? (() => {
            const project = completionCtx.store?.getProject(workItem.projectId);
            const legacyPhaseKey = workItem.title.match(/phase[\s-]*(\d+)/i)?.[1];
            const phaseKey = workItem.phaseKey ?? (legacyPhaseKey ? `phase-${legacyPhaseKey}` : undefined);
            const requiredPage = (phaseKey && project?.wikiSyncPhasePages?.[phaseKey]) || project?.wikiSyncPageSlug;
            return (completionCtx.wikiStore?.listPagesByProject(workItem.projectId) ?? []).some((page) => page.status === "published" && page.updatedAt >= workItem.updatedAt && (!requiredPage || page.slug === requiredPage));
          })()
        : undefined,
    },
    {
      journalStore,
      requiredChecks,
      // One reading for the exemption, the check requirement and the evidence gate: a leaf that may not write is
      // judged on what it observed.
      // An observation is a leaf that may not write, or one that asks for a check to come out **red** — and the
      // second half is measured: run `s19r17`'s baseline leaf asks for `exits non-zero` and two `FAILED` lines, and
      // the check-record arm had no way to tell it from a leaf that owes a green runner.
      evidenceOnly:
        inferReadOnlyJob(
          [workItem.title, workItem.description ?? "", ...(workItem.acceptanceCriteria ?? [])].join("\n"),
        ) ||
        expectsFailingCheck({
          title: workItem.title,
          description: workItem.description ?? undefined,
          acceptanceCriteria: workItem.acceptanceCriteria as unknown as string[],
        }),
      // An item with children is judged by them: their checks were gated on each child.
      container: pmStore.listWorkItemsByProject(workItem.projectId).some((item) => item.parentId === workItem.id),
      // The checkout, so Core can answer a criterion about a path it is already holding (BOARD F-145).
      ...(checkoutPath ? { checkoutPath } : {}),
      // And a red that was already red when this job started is not this job's doing.
      ...(baseline ? { baseline } : {}),
    },
  );

  if (honesty.block) {
    const { block: _block, ...refusal } = honesty;
    return { outcome: "refused", block: refusal };
  }

  if (!checkEval.ok) {
    // Unreachable while `shouldBlockDishonestSuccess` owns the same rule, and kept so a decision can never
    // pass a check the product required: the two must agree or one of them is wrong.
    const [, names = ""] = checkEval.message.split(": ");
    return {
      outcome: "refused",
      block: {
        code: /failed/i.test(checkEval.message) ? "checks_failed" : "checks_not_run",
        field: "checks",
        reason: checkEval.message,
        missing: names.replace(/\.$/, "").split(", ").filter(Boolean),
      },
    };
  }

  return { outcome: "closed" };
}

/**
 * The closure decision for a work item's most recently completed job, or `no_settled_job`.
 *
 * Read-only: nothing is written, no gate is raised, no status changes. It is what a surface calls when it
 * has to name the blocking rule for an item whose refusal predates the durable record.
 */
export function decideWorkItemClosure(
  ctx: ReconciliationContext,
  workItemId: string,
): { outcome: "closed" } | { outcome: "refused"; block: ClosureBlock } | { outcome: "no_settled_job" } {
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) return { outcome: "no_settled_job" };

  const jobId = latestCompletedJobId(ctx.journalStore, workItem.id) ?? workItem.jobId;
  const job = jobId ? ctx.store.getJob(jobId) : undefined;
  const result = jobId ? ctx.store.getJobResult(jobId) : undefined;
  if (!jobId || !job || job.status !== "succeeded" || !result) return { outcome: "no_settled_job" };

  return decideClosureAgainstJob(
    ctx.pmStore,
    ctx.journalStore,
    workItem,
    result,
    ctx.memoryStore,
    ctx.completionCtx,
    linkedFileCheckout(ctx.store.getProject(workItem.projectId)?.repositories?.[0]?.url),
    baselineBefore({ store: ctx.store, journalStore: ctx.journalStore }, workItem.projectId, jobId),
  );
}

/**
 * The closure decision for a succeeded job: everything the product can check about *whether this item is
 * done*, in one place, because three callers need it — the job-completion path, an answered human gate,
 * and a read surface that must name the rule without deciding anything.
 *
 * Closes the item (and runs the hooks closure owes: the phase auditor, the parent rollup) or reports why it
 * cannot, including the human decisions that are still open or were refused — and records that refusal as a
 * `closure_refused` journal entry, so the block is legible after this call is over (BOARD F-088).
 */
function attemptWorkItemClosure(
  pmStore: PmStore,
  journalStore: JournalStore | undefined,
  workItem: WorkItemRecord,
  jobId: string,
  result: JobResultRecord,
  memoryStore: MemoryStore | undefined,
  completionCtx?: CompletionRecipientContext,
): { closed: boolean; reason?: string; refusal?: ClosureRefusal } {
  const decision = decideClosureAgainstJob(
    pmStore,
    journalStore,
    workItem,
    result,
    memoryStore,
    completionCtx,
    linkedFileCheckout(completionCtx?.store?.getProject(workItem.projectId)?.repositories?.[0]?.url),
    completionCtx?.store
      ? baselineBefore({ store: completionCtx.store, journalStore }, workItem.projectId, jobId)
      : undefined,
  );

  if (decision.outcome === "refused") {
    // A refusal the operator cannot act on is a deadlock: the item is `blocked`, `blocked` is retryable,
    // and the retry is refused in the same words. When a decision no tool can make is part of it, the item
    // is turned into that decision — a recorded review plus a required question the web UI and the CLI
    // already render — and the answer closes it without another job. Measured 2026-09-30 on suite 08's
    // fourth run: the closure gate refused the leaf for one un-decidable criterion, no gate was raised, and
    // the leaf could never close (BOARD F-082). See `manual-evidence-gate`.
    openManualEvidenceGates({
      workItem,
      journalStore,
      questionStore: completionCtx?.questionStore,
      askedByAgentId: workItem.assigneeAgentId ?? workItem.assignedByAgentId ?? "",
      reason: decision.block.reason,
    });
    pmStore.updateWorkItem(workItem.id, { status: "blocked" });
    // A child that just became `blocked` is the container's business too: without this the container's
    // column keeps whatever it was (measured on run `s08r10`: `b7421984` was refused at `19:09:34Z` and its
    // container `c04462e4` kept reading its own stale column, BOARD F-089).
    rollupDerivedStatusForItemAndAncestors(pmStore, workItem.id);
    const detail = manualEvidenceBlockDetail(journalStore, workItem.id);
    const refusal = buildClosureRefusal(workItem, decision.block);
    recordClosureRefusal(journalStore, refusal);
    return {
      closed: false,
      reason: `${decision.block.reason}${detail ?? ""}`,
      refusal,
    };
  }

  pmStore.updateWorkItem(workItem.id, { status: "done" });
  ensurePhaseAuditorAfterLeafDone(
    pmStore,
    completionCtx?.agentStore,
    completionCtx?.store,
    workItem.id,
    journalStore,
  );
  // Its own status too, when it has children: a container's status is its children's, and a decision about
  // the container's own settled job is not a decision about the tree under it (BOARD F-089).
  rollupDerivedStatusForItemAndAncestors(pmStore, workItem.id);

  if (completionCtx?.store) {
    runPhaseCompletionHooks(
      pmStore,
      completionCtx.store,
      journalStore,
      completionCtx.wikiStore,
      completionCtx.agentStore,
      workItem.id,
      completionCtx.postActionStore,
      memoryStore,
    );
  }
  return { closed: true };
}

export function syncWorkItemFromJobResult(
  pmStore: PmStore,
  jobId: string,
  jobStatus: string,
  journalStore?: JournalStore,
  result?: JobResultRecord,
  memoryStore?: MemoryStore,
  completionCtx?: CompletionRecipientContext,
): void {
  const workItem = pmStore.getWorkItemByJobId(jobId);
  if (!workItem) return;

  if (jobStatus === "succeeded") {
    if (journalStore && result) {
      recordCompletionReportJournal(journalStore, pmStore, workItem, jobId, result, completionCtx);
    }
    if (memoryStore && result) {
      recordCompletionAgentMemory(memoryStore, workItem, result);
    }
    recordWorkPostAction(
      {
        pmStore,
        agentStore: completionCtx?.agentStore,
        journalStore,
        memoryStore,
        store: completionCtx?.store,
        wikiStore: completionCtx?.wikiStore,
        reviewStore: completionCtx?.postActionStore,
      },
      workItem,
      jobId,
      result,
      "work_completed",
      workItem.assigneeAgentId,
    );

    if (!result) return;

    // The decision lives in `attemptWorkItemClosure`, which the answered-gate path also calls: whether a
    // work item is done is one question with one implementation, and it must not drift between the path
    // that finishes a job and the path that records the emperor's decision.
    attemptWorkItemClosure(
      pmStore,
      journalStore,
      workItem,
      jobId,
      result,
      memoryStore,
      completionCtx,
    );
    return;
  }

  if (jobStatus === "failed" || jobStatus === "expired" || jobStatus === "cancelled") {
    // A settled item is settled, and a later dispatch does not unsettle it: a leaf the operator cancelled stays
    // cancelled, and one already done stays done, whatever a re-dispatch of it did. This guard is the cheap half;
    // the arm below is the one BOARD F-093 is about.
    if (workItem.status === "done" || workItem.status === "cancelled") return;

    recordWorkPostAction(
      {
        pmStore,
        agentStore: completionCtx?.agentStore,
        journalStore,
        memoryStore,
        store: completionCtx?.store,
        wikiStore: completionCtx?.wikiStore,
        reviewStore: completionCtx?.postActionStore,
      },
      workItem,
      jobId,
      result,
      "work_failed",
      workItem.assigneeAgentId,
    );
    // **A failure does not displace a success.** Measured 2026-10-04 on suite 08's `s08r11` and again on suite
    // 19's `s19r17` (BOARD F-093): a leaf dispatched twice in one turn had its first job succeed and write the
    // deliverable, then its second land nothing and fail — and this line wrote `blocked` over an item whose work
    // was on disk, freezing every item under it. The verdict is the deliverable, not the last dispatch: when the
    // item's own latest **succeeded** job still closes it, the failure is recorded (it is, above) and the item is
    // decided against the job that did the work.
    const settled = settledSuccessFor(workItem.id, jobId, journalStore, completionCtx?.store);
    if (
      settled &&
      attemptWorkItemClosure(
        pmStore,
        journalStore,
        workItem,
        settled.jobId,
        settled.result,
        memoryStore,
        completionCtx,
      ).closed
    ) {
      return;
    }

    pmStore.updateWorkItem(workItem.id, { status: "blocked" });
    rollupDerivedStatusForItemAndAncestors(pmStore, workItem.id);
  }
}

/**
 * The item's latest completed job that **succeeded**, with its result — excluding the job that just reported.
 *
 * Read from the journal, for the reason `latestCompletedJobId` gives: the completion report is the durable record
 * that names which job did the work, and only a succeeded job writes one.
 */
function settledSuccessFor(
  workItemId: string,
  currentJobId: string,
  journalStore?: JournalStore,
  store?: Store,
): { jobId: string; result: JobResultRecord } | undefined {
  if (!journalStore || !store) return undefined;
  const entries = journalStore
    .listForWorkItem(workItemId, { kinds: ["completion_report"], limit: 50 })
    .filter((entry) => entry.workItemId === workItemId && entry.refType === "job" && Boolean(entry.refId))
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const entry of entries.reverse()) {
    const settledJobId = entry.refId as string;
    if (settledJobId === currentJobId) continue;
    const job = store.getJob(settledJobId);
    const result = store.getJobResult(settledJobId);
    if (job?.status === "succeeded" && result) return { jobId: settledJobId, result };
  }
  return undefined;
}
