import { randomUUID } from "node:crypto";
import {
  executeAssessChangeRequest,
  type AssessChangeRequestArgs,
  type ChangeImpact,
} from "./change-control.js";
import type { KampakuToolContext } from "./index.js";

export interface RequestScopeApprovalArgs {
  project_slug_or_id: string;
  request: string;
  impact?: ChangeImpact;
  affects_scope?: boolean;
  affects_security?: boolean;
  affects_api?: boolean;
  blast_radius?: string;
  prompt: string;
  options: string[];
  reason?: string;
  work_item_title?: string;
  question_id?: string;
  conversation_id?: string;
}

/**
 * Park a scope-expansion change request and ask the emperor before any mutation.
 * Scenario copy (platform rewrite, SaaS billing, etc.) belongs in caller args only.
 * Allowed on the platform project when that is the blast radius.
 */
export function executeRequestScopeApproval(ctx: KampakuToolContext, args: RequestScopeApprovalArgs) {
  if (!ctx.questionStore) {
    throw new Error("Question workflow is not available.");
  }

  const request = args.request?.trim();
  if (!request || request.length < 15) {
    throw new Error("request_scope_approval requires a request description of at least 15 characters.");
  }
  const prompt = args.prompt?.trim();
  if (!prompt) {
    throw new Error("request_scope_approval requires a prompt for the emperor.");
  }
  const options = (args.options ?? []).map((option) => option.trim()).filter(Boolean);
  if (options.length < 2) {
    throw new Error("request_scope_approval requires at least two options.");
  }

  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }

  const assessArgs: AssessChangeRequestArgs = {
    request,
    impact: args.impact ?? "critical",
    affects_scope: args.affects_scope !== false,
    affects_security: args.affects_security === true,
    affects_api: args.affects_api === true,
    project_slug: project.slug,
  };
  const assessment = executeAssessChangeRequest(assessArgs);
  if (!assessment.approvalRequired) {
    throw new Error("request_scope_approval is only for changes that require emperor approval.");
  }

  const kampaku = ctx.agentStore.getKampakuAgent();
  const leadId = project.projectLeadAgentId ?? kampaku.id;
  const now = new Date().toISOString();
  const workItemId = randomUUID();
  const title = args.work_item_title?.trim() || "Parked scope expansion (awaiting emperor approval)";
  const blast = args.blast_radius?.trim() || "Named project and any linked repositories in the request";
  const reason =
    args.reason?.trim() ||
    `Parked pending emperor approval. Blast radius: ${blast}. No platform rewrite, SaaS work, or governance mutation started.`;

  ctx.pmStore.createWorkItem({
    id: workItemId,
    projectId: project.id,
    title,
    description: reason,
    status: "todo",
    priority: "high",
    sortOrder: ctx.pmStore.listWorkItemsByProject(project.id).length,
    assigneeAgentId: leadId,
    assignedByAgentId: kampaku.id,
    routingReason: "Scope expansion parked pending emperor approval",
    acceptanceCriteria: [
      "Emperor answers the pending scope-approval question",
      "No platform rewrite, speculative SaaS, or governance mutation before explicit yes",
      "Work remains blocked until the emperor answers",
    ],
    dependsOn: [],
    createdAt: now,
    updatedAt: now,
  });

  const questionId = args.question_id?.trim() || "scope-expansion-approval";
  const questionObject = {
    id: questionId,
    type: "single_choice" as const,
    prompt,
    options,
    required: true,
  };
  const questionTag = `<kampaku-question>${JSON.stringify(questionObject)}</kampaku-question>`;

  const question = ctx.questionStore.askDirect({
    askedByAgentId: kampaku.id,
    question: questionTag,
    context: [
      args.conversation_id
        ? `conversation_id: ${args.conversation_id}; question_id: ${questionId}`
        : `question_id: ${questionId}`,
      `project_slug: ${project.slug}`,
      `work_item_id: ${workItemId}`,
      `blast_radius: ${blast}`,
      "Parked change request — no mutation until explicit emperor yes.",
      "Answer from Dashboard pending questions or CLI `kampaku questions answer`.",
    ].join("\n"),
    projectId: project.id,
    workItemId,
  });

  const workItem = ctx.pmStore.getWorkItem(workItemId)!;
  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    workItem: { id: workItem.id, title: workItem.title, status: workItem.status },
    question: {
      id: question.id,
      questionId,
      status: question.status,
      prompt,
      options,
    },
    questionTag,
    assessment,
    blastRadius: blast,
    executed: false,
    mutatedLeadOrRepos: false,
    jobsStarted: 0,
    summary:
      `Parked scope expansion on ${project.slug}: work item ${workItem.id} is ${workItem.status}; ` +
      `pending question ${question.id}. Assessment impact=${assessment.impact}; approval required. ` +
      "No rewrite, SaaS implementation, or governance mutation started.",
  };
}

export const REQUEST_SCOPE_APPROVAL_TOOL = {
  type: "function" as const,
  function: {
    name: "request_scope_approval",
    description:
      "Park a scope-expansion or platform-change request and open an emperor approval question before any mutation. Reuses change assessment (high/critical/scope/security/API). Pass scenario-specific request, blast_radius, prompt, and options in args. Allowed on the platform project when that is the blast radius. Never starts jobs, never rewrites control plane, never reassigns lead or retargets repos. Emit questionTag verbatim. Kampaku only.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Project slug or id that owns the parked request (may be kampaku for platform blast radius).",
        },
        request: {
          type: "string",
          description: "Plain English description of the requested change (≥15 characters).",
        },
        prompt: {
          type: "string",
          description: "Plain-text approval question for the emperor.",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "At least two single-choice options (typically No + Yes with named consequences).",
        },
        impact: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
        affects_scope: { type: "boolean" },
        affects_security: { type: "boolean" },
        affects_api: { type: "boolean" },
        blast_radius: {
          type: "string",
          description: "Human-readable blast radius shown in the parked work and reply.",
        },
        conversation_id: { type: "string" },
        reason: { type: "string" },
        work_item_title: { type: "string" },
        question_id: { type: "string" },
      },
      required: ["project_slug_or_id", "request", "prompt", "options"],
    },
  },
};
