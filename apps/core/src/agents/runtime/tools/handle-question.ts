import type { KampakuToolContext } from "./index.js";

export interface AnswerQuestionArgs {
  question_id: string;
  agent_slug: string;
  answer: string;
}

export interface EscalateQuestionArgs {
  question_id: string;
  agent_slug: string;
}

function resolveAgentId(ctx: KampakuToolContext, slug: string): string {
  const agent = ctx.agentStore.getAgentBySlugOrId(slug);
  if (!agent) throw new Error(`Agent "${slug}" not found.`);
  return agent.id;
}

export function executeAnswerQuestion(ctx: KampakuToolContext, args: AnswerQuestionArgs) {
  if (!ctx.questionStore) throw new Error("Question workflow is not available.");
  const agentId = resolveAgentId(ctx, args.agent_slug);
  return ctx.questionStore.answer(args.question_id, args.answer, agentId);
}

export function executeEscalateQuestion(ctx: KampakuToolContext, args: EscalateQuestionArgs) {
  if (!ctx.questionStore) throw new Error("Question workflow is not available.");
  const agentId = resolveAgentId(ctx, args.agent_slug);
  return ctx.questionStore.escalate(args.question_id, agentId);
}

export const ANSWER_QUESTION_TOOL = {
  type: "function" as const,
  function: {
    name: "answer_question",
    description:
      "Answer a pending agent question. Only the current recipient can answer. Linked tasks unblock when all pending escalations are cleared.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        agent_slug: { type: "string", description: "Slug of the manager answering the question." },
        answer: { type: "string" },
      },
      required: ["question_id", "agent_slug", "answer"],
    },
  },
};

export const ESCALATE_QUESTION_TOOL = {
  type: "function" as const,
  function: {
    name: "escalate_question",
    description:
      "Escalate a pending question to your superior when you cannot answer it. Only the current recipient can escalate.",
    parameters: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        agent_slug: { type: "string", description: "Slug of the manager escalating the question." },
      },
      required: ["question_id", "agent_slug"],
    },
  },
};
