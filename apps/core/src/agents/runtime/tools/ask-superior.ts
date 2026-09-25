import type { KampakuToolContext } from "./index.js";

export interface AskSuperiorArgs {
  agent_slug: string;
  question: string;
  context?: string;
  project_id?: string;
  work_item_id?: string;
  question_type?: "text" | "single_choice" | "multiple_choice" | "boolean";
  options?: string[];
  placeholder?: string;
  true_label?: string;
  false_label?: string;
}

export function executeAskSuperior(ctx: KampakuToolContext, args: AskSuperiorArgs) {
  if (!ctx.questionStore) throw new Error("Question workflow is not available.");
  const questionType = args.question_type ?? "text";
  const questionObject = {
    id: `async-${Date.now()}`,
    type: questionType,
    prompt: args.question,
    ...(questionType === "single_choice" || questionType === "multiple_choice" ? { options: args.options } : {}),
    ...(questionType === "text" && args.placeholder ? { placeholder: args.placeholder } : {}),
    ...(questionType === "boolean" ? { trueLabel: args.true_label ?? "Yes", falseLabel: args.false_label ?? "No" } : {}),
    required: true,
  };
  const tagged = `<kampaku-question>${JSON.stringify(questionObject)}</kampaku-question>`;

  // Asking the same decision twice is reported as what it is. The store returns the open record rather than
  // opening a second gate; without saying so, the caller learns nothing and tries again next turn — which is
  // the loop the suite-05 run measured (BOARD F-049).
  const alreadyOpen = ctx.questionStore.findPendingDuplicate({
    askedByAgentId: args.agent_slug,
    projectId: args.project_id,
    question: tagged,
  });

  const record = ctx.questionStore.ask({
    askedByAgentId: args.agent_slug,
    question: tagged,
    context: args.context,
    projectId: args.project_id,
    workItemId: args.work_item_id,
  });

  return {
    ...record,
    message: alreadyOpen
      ? `This decision is already open as question ${record.id} and was not opened again. It is waiting on ` +
        "the answer recorded there: continue what you can, and do not re-ask it in a new form."
      : "Question sent to the agent's direct superior. Related tasks are blocked until it is answered.",
    alreadyOpen: Boolean(alreadyOpen),
  };
}

export const ASK_SUPERIOR_TOOL = {
  type: "function" as const,
  function: {
    name: "ask_superior",
    description: "Block related tasks and ask an agent's direct superior for a missing decision. Choose the input type that best fits the decision and provide concise options when applicable. The question field is a short plain-text prompt; the context field supports Markdown for emperor-facing background. The superior may answer or escalate it up the hierarchy until Kampaku asks the emperor.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        question: { type: "string" },
        context: { type: "string" },
        project_id: { type: "string" },
        work_item_id: { type: "string" },
        question_type: { type: "string", enum: ["text", "single_choice", "multiple_choice", "boolean"] },
        options: { type: "array", items: { type: "string" }, description: "Two or more choices for single_choice or multiple_choice." },
        placeholder: { type: "string", description: "Input hint for a text question." },
        true_label: { type: "string", description: "Affirmative label for a boolean question." },
        false_label: { type: "string", description: "Negative label for a boolean question." },
      },
      required: ["agent_slug", "question"],
    },
  },
};
