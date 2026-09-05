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
  return `Respuesta a la pregunta [question_id: ${question.id}] «${question.prompt}»: ${rendered}`;
}

export function formatContextRequest(question: ChatQuestion): string {
  return `No tengo suficiente contexto para responder la pregunta «${question.prompt}». Dame más antecedentes: rastrea su origen, explica qué la motivó, qué decisión habilita y las consecuencias de cada alternativa. Conserva esta pregunta pendiente y, después de explicarla, vuelve a formularla usando el mismo objeto <kampaku-question> con id «${question.id}».`;
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
    `Investiga la pregunta asíncrona pendiente [question_id: ${input.id}] «${input.prompt}».`,
    `La formuló ${input.askedByAgentSlug}.`,
    input.projectId ? `Proyecto: ${input.projectId}.` : "",
    input.workItemId ? `Tarea: ${input.workItemId}.` : "",
    input.context ? `Contexto inicial: ${input.context}.` : "",
    "Rastrea su origen consultando el proyecto, la tarea, el journal y los agentes involucrados. Si falta información, coordina con los agentes pertinentes mediante las herramientas disponibles. Explícame qué la motivó, qué decisión desbloquea, las alternativas, sus consecuencias y tu recomendación. No respondas la pregunta por mí ni la marques como resuelta; devuelve solamente los antecedentes para que yo pueda decidir en la tarjeta pendiente.",
  ].filter(Boolean).join("\n");
}
