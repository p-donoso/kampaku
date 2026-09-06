import { randomUUID } from "node:crypto";
import type { KampakuToolContext } from "./index.js";

export interface AskBlockingQuestionArgs {
  project_slug_or_id: string;
  /** Plain-text emperor question prompt (required for a clear gate). */
  prompt: string;
  /** At least two single-choice options for the emperor. */
  options: string[];
  reason?: string;
  work_item_title?: string;
  question_id?: string;
  conversation_id?: string;
}

/**
 * Emperor-facing blocking ask: create waiting work on a stranger project, pause it,
 * and open a pending question until the emperor decides. Scenario-specific copy
 * (SMS, keys, vendors, etc.) belongs in the caller args — not in this tool.
 */
export function executeAskBlockingQuestion(ctx: KampakuToolContext, args: AskBlockingQuestionArgs) {
  if (!ctx.questionStore) {
    throw new Error("Question workflow is not available.");
  }

  const prompt = args.prompt?.trim();
  if (!prompt) {
    throw new Error("ask_blocking_question requires a prompt for the emperor.");
  }
  const options = (args.options ?? []).map((option) => option.trim()).filter(Boolean);
  if (options.length < 2) {
    throw new Error("ask_blocking_question requires at least two options.");
  }

  const project = ctx.store.getProjectByIdOrSlug(args.project_slug_or_id.trim());
  if (!project) {
    throw new Error(`Project "${args.project_slug_or_id}" not found.`);
  }
  if (project.slug === "kampaku") {
    throw new Error("Refusing to open blocking questions on the platform project via this tool.");
  }

  const kampaku = ctx.agentStore.getKampakuAgent();
  const leadId = project.projectLeadAgentId ?? kampaku.id;
  const now = new Date().toISOString();
  const workItemId = randomUUID();
  const title = args.work_item_title?.trim() || "Blocked pending emperor decision";
  const reason =
    args.reason?.trim() ||
    "Stopped safely: missing emperor decision. Do not invent missing facts or claim the work done.";

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
    routingReason: "Emperor-directed work blocked pending human decision",
    acceptanceCriteria: [
      "Emperor answers the pending question",
      "No invented secrets or fake completion claims",
      "Work remains blocked until the emperor answers",
    ],
    dependsOn: [],
    createdAt: now,
    updatedAt: now,
  });

  const questionId = args.question_id?.trim() || "blocking-decision";
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
      "Blocked safely pending emperor decision.",
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
    inventedSecrets: false,
    claimedDone: false,
    resumesOnAnswer: true,
    summary:
      `Stopped safely on ${project.slug}: work item ${workItem.id} is ${workItem.status}; ` +
      `pending question ${question.id} awaits the emperor. ` +
      "Answering the question unblocks the work item (does not mark it done).",
  };
}

export const ASK_BLOCKING_QUESTION_TOOL = {
  type: "function" as const,
  function: {
    name: "ask_blocking_question",
    description:
      "When stranger-project work cannot continue without an emperor decision, create a blocked work item and open a pending emperor question. Pass scenario-specific prompt/options (vendor, secret, design choice, etc.). Answering unblocks the work (typically back to todo) but does not mark it done or invent missing facts. Emit the returned questionTag verbatim in chat. Kampaku only.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Stranger project slug or id (not kampaku).",
        },
        prompt: {
          type: "string",
          description: "Plain-text question for the emperor.",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "At least two single-choice options.",
        },
        conversation_id: {
          type: "string",
          description: "Current conversation id so pending recovery does not recreate answered questions.",
        },
        reason: {
          type: "string",
          description: "Short English reason stored on the blocked work item.",
        },
        work_item_title: { type: "string" },
        question_id: {
          type: "string",
          description: "Stable structured question id (default: blocking-decision).",
        },
      },
      required: ["project_slug_or_id", "prompt", "options"],
    },
  },
};
