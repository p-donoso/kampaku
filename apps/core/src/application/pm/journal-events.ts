import type { AgentStore } from "../../persistence/agent-store.js";
import type { AgentBlockageRecord } from "../../persistence/blockage-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { AgentQuestionRecord } from "../../persistence/question-store.js";
import type { JobResultRecord, Store } from "../../persistence/store.js";
import type { MemoryStore } from "../../persistence/memory-store.js";
import type { WikiStore } from "../../persistence/wiki-store.js";
import type { PostActionReviewStore } from "../../persistence/post-action-store.js";
import type { QuestionStore } from "../../persistence/question-store.js";
import { buildCompletionMessages } from "./completion-summary.js";

export interface CompletionRecipientContext {
  agentStore?: AgentStore;
  store?: Store;
  wikiStore?: WikiStore;
  postActionStore?: PostActionReviewStore;
  /**
   * Where a criterion no tool can decide becomes a question the operator can answer.
   *
   * It rides on the completion context because the closure decision is what discovers the criterion: a job
   * that did its work and cannot be closed for a judgement-shaped criterion has to raise that gate at the
   * moment it is refused, or the leaf deadlocks (BOARD F-082).
   */
  questionStore?: QuestionStore;
}

export function resolveCompletionRecipient(
  workItem: WorkItemRecord,
  ctx: CompletionRecipientContext = {},
): string | undefined {
  if (workItem.assigneeAgentId && ctx.agentStore) {
    const assignee = ctx.agentStore.getAgentBySlugOrId(workItem.assigneeAgentId);
    if (assignee?.parentId) {
      return assignee.parentId;
    }
  }

  if (ctx.store) {
    const project = ctx.store.getProject(workItem.projectId);
    if (project?.projectLeadAgentId) {
      return project.projectLeadAgentId;
    }
  }

  return workItem.assignedByAgentId ?? workItem.assigneeAgentId;
}

function requireProjectId(
  workItemId: string | undefined,
  projectId: string | undefined,
  pmStore: PmStore,
): { projectId: string; workItem: WorkItemRecord } | undefined {
  if (!workItemId) return undefined;
  const workItem = pmStore.getWorkItem(workItemId);
  if (!workItem) return undefined;
  return { projectId: projectId ?? workItem.projectId, workItem };
}

export function recordDelegationJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  input: {
    projectId: string;
    workItemId: string;
    parentId?: string;
    title: string;
    fromAgentId?: string;
    toAgentId: string;
    reason: string;
    occurredAt: string;
  },
): void {
  if (!journalStore) return;

  const anchorWorkItemId = input.parentId ?? input.workItemId;
  journalStore.append({
    projectId: input.projectId,
    workItemId: input.workItemId,
    anchorWorkItemId,
    kind: "delegation",
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
    title: `Delegated: ${input.title}`,
    body: input.reason,
    refType: "work_item",
    refId: input.workItemId,
    occurredAt: input.occurredAt,
  });
}

export function recordCompletionReportJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  workItem: WorkItemRecord,
  jobId: string,
  result: JobResultRecord,
  ctx: CompletionRecipientContext = {},
): void {
  if (!journalStore) return;

  const output = result.output ?? {};
  const { journalBody } = buildCompletionMessages(workItem, result);

  const toAgentId = resolveCompletionRecipient(workItem, ctx);
  journalStore.append({
    projectId: workItem.projectId,
    workItemId: workItem.id,
    kind: "completion_report",
    fromAgentId: workItem.assigneeAgentId,
    toAgentId,
    title: `Completed: ${workItem.title}`,
    body: journalBody,
    refType: "job",
    refId: jobId,
    metadata: { jobStatus: result.status, output },
    occurredAt: result.finishedAt,
  });
}

export function recordCompletionAgentMemory(
  memoryStore: MemoryStore | undefined,
  workItem: WorkItemRecord,
  result: JobResultRecord,
): void {
  if (!memoryStore || !workItem.assigneeAgentId) return;

  const { agentBody, agentSummary } = buildCompletionMessages(workItem, result);

  memoryStore.create({
    agentId: workItem.assigneeAgentId,
    kind: "log",
    title: `Completed: ${workItem.title}`,
    body: agentBody,
    summary: agentSummary,
    relevance: 4,
    projectId: workItem.projectId,
    workItemId: workItem.id,
    metadata: { jobId: result.jobId, jobStatus: result.status, source: "job_completion" },
  });
}

export function recordQuestionRaisedJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  question: AgentQuestionRecord,
): void {
  if (!journalStore) return;
  const ctx = requireProjectId(question.workItemId, question.projectId, pmStore);
  if (!ctx) return;

  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "question_raised",
    fromAgentId: question.askedByAgentId,
    toAgentId: question.recipientAgentId,
    title: "Question raised",
    body: question.context ? `${question.question}\n\nContext: ${question.context}` : question.question,
    refType: "question",
    refId: question.id,
    occurredAt: question.createdAt,
  });
}

export function recordQuestionAnsweredJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  question: AgentQuestionRecord,
): void {
  if (!journalStore || !question.answer) return;
  const ctx = requireProjectId(question.workItemId, question.projectId, pmStore);
  if (!ctx) return;

  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "question_answered",
    fromAgentId: question.answeredByAgentId,
    toAgentId: question.askedByAgentId,
    title: "Question answered",
    body: question.answer,
    refType: "question",
    refId: question.id,
    occurredAt: question.answeredAt ?? new Date().toISOString(),
  });
}

export function recordQuestionEscalatedJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  before: AgentQuestionRecord,
  after: AgentQuestionRecord,
): void {
  if (!journalStore) return;
  const ctx = requireProjectId(before.workItemId, before.projectId, pmStore);
  if (!ctx) return;

  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "question_escalated",
    fromAgentId: before.recipientAgentId,
    toAgentId: after.recipientAgentId,
    title: "Question escalated",
    body: before.question,
    refType: "question",
    refId: before.id,
    occurredAt: new Date().toISOString(),
  });
}

export function recordBlockerReportedJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  blocker: AgentBlockageRecord,
): void {
  if (!journalStore) return;
  const ctx = requireProjectId(blocker.workItemId, blocker.projectId, pmStore);
  if (!ctx) return;

  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "blocker_reported",
    fromAgentId: blocker.reportedByAgentId,
    toAgentId: blocker.recipientAgentId,
    title: "Blocker reported",
    body: blocker.context ? `${blocker.description}\n\nContext: ${blocker.context}` : blocker.description,
    refType: "blocker",
    refId: blocker.id,
    occurredAt: blocker.createdAt,
  });
}

export function recordBlockerResolvedJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  blocker: AgentBlockageRecord,
): void {
  if (!journalStore || !blocker.resolution) return;
  const ctx = requireProjectId(blocker.workItemId, blocker.projectId, pmStore);
  if (!ctx) return;

  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "blocker_resolved",
    fromAgentId: blocker.resolvedByAgentId,
    toAgentId: blocker.reportedByAgentId,
    title: "Blocker resolved",
    body: blocker.resolution,
    refType: "blocker",
    refId: blocker.id,
    metadata: { resolutionKind: blocker.resolutionKind },
    occurredAt: blocker.resolvedAt ?? new Date().toISOString(),
  });
}

export function recordBlockerEscalatedJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  before: AgentBlockageRecord,
  after: AgentBlockageRecord,
): void {
  if (!journalStore) return;
  const ctx = requireProjectId(before.workItemId, before.projectId, pmStore);
  if (!ctx) return;

  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "blocker_escalated",
    fromAgentId: before.recipientAgentId,
    toAgentId: after.recipientAgentId,
    title: "Blocker escalated",
    body: before.description,
    refType: "blocker",
    refId: before.id,
    occurredAt: new Date().toISOString(),
  });
}

export function recordBlockerConvertedJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  blocker: AgentBlockageRecord,
  question: AgentQuestionRecord,
): void {
  if (!journalStore) return;
  const ctx = requireProjectId(blocker.workItemId, blocker.projectId, pmStore);
  if (!ctx) return;

  const occurredAt = blocker.resolvedAt ?? new Date().toISOString();
  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "blocker_converted",
    fromAgentId: blocker.resolvedByAgentId,
    toAgentId: blocker.reportedByAgentId,
    title: "Blocker converted to question",
    body: blocker.description,
    refType: "blocker",
    refId: blocker.id,
    metadata: { questionId: question.id },
    occurredAt,
  });
  recordQuestionRaisedJournal(journalStore, pmStore, question);
}

export function recordBlockerDelegatedJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  agentStore: AgentStore,
  blocker: AgentBlockageRecord,
  workItem: WorkItemRecord,
  byAgentId: string,
): void {
  if (!journalStore) return;
  const ctx = requireProjectId(blocker.workItemId, blocker.projectId, pmStore);
  if (!ctx) return;

  const assignee = workItem.assigneeAgentId
    ? agentStore.getAgentBySlugOrId(workItem.assigneeAgentId)
    : undefined;

  journalStore.append({
    projectId: ctx.projectId,
    workItemId: ctx.workItem.id,
    kind: "blocker_delegated",
    fromAgentId: byAgentId,
    toAgentId: assignee?.id,
    title: `Blocker delegated: ${workItem.title}`,
    body: blocker.resolution ?? `Delegated as work item ${workItem.id}.`,
    refType: "blocker",
    refId: blocker.id,
    metadata: { delegatedWorkItemId: workItem.id },
    occurredAt: blocker.resolvedAt ?? new Date().toISOString(),
  });
}

export function recordManualCompletionReportJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  input: {
    workItemId: string;
    fromAgentId: string;
    summary: string;
    details?: string;
  },
  ctx: CompletionRecipientContext = {},
): void {
  if (!journalStore) return;
  const workItem = pmStore.getWorkItem(input.workItemId);
  if (!workItem) throw new Error("Work item not found.");

  const body = input.details?.trim()
    ? `${input.summary.trim()}\n\n${input.details.trim()}`
    : input.summary.trim();

  journalStore.append({
    projectId: workItem.projectId,
    workItemId: workItem.id,
    kind: "completion_report",
    fromAgentId: input.fromAgentId,
    toAgentId: resolveCompletionRecipient(workItem, ctx),
    title: `Report: ${workItem.title}`,
    body,
    refType: "work_item",
    refId: workItem.id,
  });
}

export function recordAuditProposalJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  input: {
    projectId: string;
    anchorWorkItemId: string;
    fromAgentId: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
): void {
  if (!journalStore) return;

  journalStore.append({
    projectId: input.projectId,
    workItemId: input.anchorWorkItemId,
    anchorWorkItemId: input.anchorWorkItemId,
    kind: "audit_proposal",
    fromAgentId: input.fromAgentId,
    title: input.title,
    body: input.body,
    refType: "work_item",
    refId: input.anchorWorkItemId,
    metadata: input.metadata,
  });
}

export function recordDeliverableAuditJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  input: {
    projectId: string;
    anchorWorkItemId: string;
    fromAgentId: string;
    title: string;
    body: string;
    severity: "blocker" | "high" | "medium" | "low";
    recommendation?: string;
    metadata?: Record<string, unknown>;
  },
): void {
  if (!journalStore) return;

  journalStore.append({
    projectId: input.projectId,
    workItemId: input.anchorWorkItemId,
    anchorWorkItemId: input.anchorWorkItemId,
    kind: "deliverable_audit",
    fromAgentId: input.fromAgentId,
    title: input.title,
    body: input.recommendation
      ? `${input.body}\n\nRecommendation: ${input.recommendation}`
      : input.body,
    refType: "work_item",
    refId: input.anchorWorkItemId,
    metadata: { severity: input.severity, ...input.metadata },
  });
}

export function recordPhaseGateJournal(
  journalStore: JournalStore | undefined,
  pmStore: PmStore,
  input: {
    projectId: string;
    phaseWorkItemId: string;
    phaseTitle: string;
    repositoryPath?: string;
  },
): void {
  if (!journalStore) return;

  journalStore.append({
    projectId: input.projectId,
    workItemId: input.phaseWorkItemId,
    anchorWorkItemId: input.phaseWorkItemId,
    kind: "phase_gate",
    title: `Phase gate: ${input.phaseTitle}`,
    body: [
      `Phase "${input.phaseTitle}" reached done rollup.`,
      input.repositoryPath ? `Repository: ${input.repositoryPath}` : "No linked repository.",
      "Run audit-phase-gate before advancing to the next phase.",
    ].join("\n"),
    refType: "work_item",
    refId: input.phaseWorkItemId,
    metadata: { hook: "phase_completion" },
  });
}
