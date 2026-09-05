export type ChatQuestion =
  | { id: string; type: "text"; prompt: string; placeholder?: string; required?: boolean }
  | { id: string; type: "single_choice"; prompt: string; options: string[]; required?: boolean }
  | { id: string; type: "multiple_choice"; prompt: string; options: string[]; required?: boolean }
  | { id: string; type: "boolean"; prompt: string; trueLabel?: string; falseLabel?: string; required?: boolean };

export interface ParsedAssistantMessage {
  text: string;
  question: ChatQuestion | null;
}

const QUESTION_PATTERN = /<kampaku-question>\s*([\s\S]*?)\s*<\/kampaku-question>/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validOptions(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 2 && value.every((option) => typeof option === "string" && option.trim());
}

function parseQuestion(value: unknown): ChatQuestion | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.prompt !== "string") return null;
  const common = { id: value.id, prompt: value.prompt, required: value.required !== false };

  if (value.type === "text") {
    return { ...common, type: "text", placeholder: typeof value.placeholder === "string" ? value.placeholder : undefined };
  }
  if ((value.type === "single_choice" || value.type === "multiple_choice") && validOptions(value.options)) {
    return { ...common, type: value.type, options: value.options };
  }
  if (value.type === "boolean") {
    return {
      ...common,
      type: "boolean",
      trueLabel: typeof value.trueLabel === "string" ? value.trueLabel : undefined,
      falseLabel: typeof value.falseLabel === "string" ? value.falseLabel : undefined,
    };
  }
  return null;
}

export function parseAssistantMessage(content: string): ParsedAssistantMessage {
  const match = content.match(QUESTION_PATTERN);
  if (!match) return { text: content, question: null };

  try {
    let decoded: unknown;
    try {
      decoded = JSON.parse(match[1]);
    } catch {
      // Some models copy the JSON-escaped example from the system prompt verbatim.
      decoded = JSON.parse(match[1].replace(/\\"/g, '"'));
    }
    const question = parseQuestion(decoded);
    if (!question) return { text: content, question: null };
    return { text: content.replace(match[0], "").trim(), question };
  } catch {
    return { text: content, question: null };
  }
}

export function formatQuestionAnswer(question: ChatQuestion, answer: string | string[]): string {
  const rendered = Array.isArray(answer) ? answer.join(", ") : answer;
  return `Answer to question [question_id: ${question.id}] «${question.prompt}»: ${rendered}`;
}

export function formatContextRequest(question: ChatQuestion): string {
  return `I do not have enough context to answer the question «${question.prompt}». Give me more background: trace its origin, explain what motivated it, what decision it unlocks, and the consequences of each alternative. Keep this question pending and, after explaining it, ask it again using the same <kampaku-question> object with id «${question.id}».`;
}

export function formatAsyncQuestionContextRequest(input: {
  id: string;
  prompt: string;
  context?: string;
  askedByAgentSlug: string;
  projectId?: string;
  workItemId?: string;
}): string {
  return [
    `Investigate the pending async question [question_id: ${input.id}] «${input.prompt}».`,
    `Asked by ${input.askedByAgentSlug}.`,
    input.projectId ? `Project: ${input.projectId}.` : "",
    input.workItemId ? `Work item: ${input.workItemId}.` : "",
    input.context ? `Initial context: ${input.context}.` : "",
    "Trace its origin by consulting the project, work item, journal, and involved agents. If information is missing, coordinate with the relevant agents using the available tools. Explain what motivated it, what decision it unlocks, the alternatives, their consequences, and your recommendation. Do not answer the question for me or mark it as resolved; return only the background so I can decide on the pending card.",
  ].filter(Boolean).join("\n");
}

export function isQuestionAnswered(messages: Array<{ role: string; content: string }>, questionId: string): boolean {
  const marker = `question_id: ${questionId}`;
  return messages.some((message) => message.role === "user" && message.content.includes(marker));
}
