import type { AppConfig, RepositoryRole } from "../../config.js";
import { createGoalWithPlan } from "../../planner/create-goal.js";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { SkillStore } from "../../persistence/skill-store.js";
import type { Store, JobResultRecord } from "../../persistence/store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import { recordCompletionReportJournal, recordCompletionAgentMemory, type CompletionRecipientContext } from "./journal-events.js";
import { buildPostActionRuntime, recordPostActionLifecycle } from "./post-action/index.js";
import {
  evaluateJobCheckResults,
  inferRequiredChecksFromWorkItem,
} from "./work-item-checks.js";
import { runPhaseCompletionHooks } from "./phase-completion-hook.js";
import { ensurePhaseAuditorAfterLeafDone } from "./phase-auditor-gate.js";
import { formatAcceptanceCriteriaForWorker } from "./acceptance-criteria.js";
import { shouldBlockDishonestSuccess } from "./done-honesty.js";
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
} from "./work-item-order.js";
import { rollupParentWorkItemStatuses } from "./work-item-parent-rollup.js";

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
  const eligibility = canExecuteLeaf(workItem, orderedLeaves, projectItems, ctx.pmStore);
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

  assertWorkCanBeLeased(ctx);

  const { goal, jobId } = await createGoalWithPlan(ctx.store, ctx.config, {
    projectId: project.id,
    objective,
    priority: workItem.priority,
    repositoryRole: projectContext.repositoryRole,
    projectContext,
    memoryContext: recallLearningsForJob(ctx.memoryStore, workItem),
    plannedTask: {
      title: workItem.title,
      prompt: objective,
      repositoryRole: projectContext.repositoryRole,
      acceptanceCriteria: workItem.acceptanceCriteria,
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
): { status: WorkItemRecord["status"]; reason?: string } | undefined {
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
  return { status: outcome.closed ? "done" : "blocked", reason: outcome.reason };
}

/** The most recent job whose completion was recorded for this work item. */
function latestCompletedJobId(
  journalStore: JournalStore | undefined,
  workItemId: string,
): string | undefined {
  if (!journalStore) return undefined;
  const entries = journalStore.listForWorkItem(workItemId, {
    kinds: ["completion_report"],
    limit: 50,
  });
  const latest = entries
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
): { resolved: number; workItemStatus?: WorkItemRecord["status"]; reason?: string } {
  const resolved = resolveManualEvidenceFromAnswer({
    journalStore: ctx.journalStore,
    questionText: input.questionText,
    answer: input.answer,
    answeredByAgentId: input.answeredByAgentId,
    workItemId: input.workItemId,
  });
  if (resolved.length === 0 || !input.workItemId) return { resolved: resolved.length };

  const outcome = reevaluateBlockedWorkItemClosure(ctx, input.workItemId);
  return { resolved: resolved.length, workItemStatus: outcome?.status, reason: outcome?.reason };
}

/**
 * The closure decision for a succeeded job: everything the product can check about *whether this item is
 * done*, in one place, because two callers need it — the job-completion path and an answered human gate.
 *
 * Closes the item (and runs the hooks closure owes: the phase auditor, the parent rollup) or reports why it
 * cannot, including the human decisions that are still open or were refused.
 */
function attemptWorkItemClosure(
  pmStore: PmStore,
  journalStore: JournalStore | undefined,
  workItem: WorkItemRecord,
  jobId: string,
  result: JobResultRecord,
  memoryStore: MemoryStore | undefined,
  completionCtx?: CompletionRecipientContext,
): { closed: boolean; reason?: string } {
  const requiredChecks = inferRequiredChecksFromWorkItem(workItem);
  const output = result.output && typeof result.output === "object"
    ? (result.output as Record<string, unknown>)
    : {};
  const checkResults = output.checkResults;
  const checkEval = evaluateJobCheckResults(
    requiredChecks,
    checkResults as Record<string, unknown> | undefined,
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
    { journalStore },
  );

  if (honesty.block || !checkEval.ok) {
    // A refusal the operator cannot act on is a deadlock: the item is `blocked`, `blocked` is retryable,
    // and the retry is refused in the same words. When the only thing missing is a decision no tool can
    // make, the item is turned into that decision — a recorded review plus a required question the web UI
    // and the CLI already render — and the answer closes it without another job. Measured 2026-09-30 on
    // suite 08's fourth run: the closure gate refused the leaf for one un-decidable criterion, no gate was
    // raised, and the leaf could never close (BOARD F-082). See `manual-evidence-gate`.
    if (honesty.block) {
      openManualEvidenceGates({
        workItem,
        journalStore,
        questionStore: completionCtx?.questionStore,
        askedByAgentId: workItem.assigneeAgentId ?? workItem.assignedByAgentId ?? "",
        reason: honesty.reason,
      });
    }
    pmStore.updateWorkItem(workItem.id, { status: "blocked" });
    const detail = manualEvidenceBlockDetail(journalStore, workItem.id);
    return {
      closed: false,
      reason: `${honesty.block ? honesty.reason : checkEval.ok ? "" : (checkEval as { message: string }).message}${detail ?? ""}`,
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
  rollupParentWorkItemStatuses(pmStore, workItem.id);

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
    pmStore.updateWorkItem(workItem.id, { status: "blocked" });
  }
}
