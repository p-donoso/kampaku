/**
 * Parses the `<kampaku-question>` block a chat reply may end with.
 *
 * Why this lives in core (and not only in the web client): the tag is the protocol the
 * root agent must use to ask the emperor for a decision (see `agents/definitions.ts`),
 * but the web client's parser is presentational — it renders a widget and persists
 * nothing. As a result a required question asked in chat had no durable record: it was
 * invisible to `questions list` and to `GET /api/v1/questions`, so the human gate could
 * not be answered through any surface (LangProbe gap G-01).
 *
 * The acceptance rules below intentionally mirror `apps/web/src/lib/chat-question.ts` so
 * the stored question and the rendered one can never disagree. Web answers "is this
 * renderable?"; core additionally answers "should this become a pending question?".
 */

const QUESTION_PATTERN = /<kampaku-question>\s*([\s\S]*?)\s*<\/kampaku-question>/i;

const QUESTION_TYPES = new Set(["text", "single_choice", "multiple_choice", "boolean"]);

export interface PendingQuestion {
  /** Stable id chosen by the agent; re-asking with the same id must not duplicate. */
  id: string;
  prompt: string;
  /** `required` defaults to true, matching the web contract. */
  required: boolean;
  /** The original tag, kept verbatim so the store holds renderable markup. */
  raw: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validOptions(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((option) => typeof option === "string" && option.trim().length > 0)
  );
}

function normalize(value: unknown): PendingQuestion | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.prompt !== "string" || !value.prompt.trim()) return null;
  if (typeof value.type !== "string" || !QUESTION_TYPES.has(value.type)) return null;
  if (
    (value.type === "single_choice" || value.type === "multiple_choice") &&
    !validOptions(value.options)
  ) {
    return null;
  }

  return {
    id: value.id.trim(),
    prompt: value.prompt.trim(),
    required: value.required !== false,
    raw: "",
  };
}

/** Any `<kampaku-question>` block, well-formed or not. */
const QUESTION_TAG_PATTERN = /<kampaku-question>[\s\S]*?<\/kampaku-question>/i;

/**
 * Replaces a question tag that could **not** be read with the sentence that says so.
 *
 * The tag is a protocol, and a malformed one is not a gate: it parses to nothing, no question is stored, and
 * no surface can answer it. Left in place it is worse than absent, because the operator reads broken JSON in
 * the reply and concludes the console glitched while the decision inside it silently waits nowhere. Measured
 * 2026-11-09 on suite 19 run `s19r17`: a scope-discipline turn answered *"Name the project and I will park
 * both rows"* and closed with
 * `<kampaku-question>{"id":"expansion-target-project","type":"single_choice","prompt":"…",options:[…]}</kampaku-question>`
 * — `options` unquoted, JSON invalid. `GET /api/v1/questions` held nothing, the scope-request store held
 * nothing, and the reply the emperor read carried the markup.
 *
 * `session.ts` already replaces the tag when the store **declines** to open a gate (BOARD F-111). This is the
 * other door to the same room: a tag the parser cannot read was never offered to the store at all.
 */
export function noteUnreadableQuestion(reply: string): string {
  const match = reply.match(QUESTION_TAG_PATTERN);
  if (!match) return reply;
  if (parsePendingQuestion(reply)) return reply;
  const notice =
    "**Nothing is waiting on you for this, and the question above is not one.** The decision this reply " +
    "carried could not be read — its `<kampaku-question>` block was not valid JSON, so no gate was opened " +
    "and no surface holds it: not the question list, not the project's execution state, not the CLI. " +
    "Nothing was parked, approved or refused on the strength of it. Say what you want done and I will put " +
    "the decision to you again in a turn that can store it.";
  return reply.replace(match[0], () => notice).replace(/\s+$/, "");
}

/**
 * Returns the parsed question when the reply ends with a well-formed tag, or `null`
 * for prose-only replies (the common case) and for malformed tags.
 */
export function parsePendingQuestion(content: string): PendingQuestion | null {
  const match = content.match(QUESTION_PATTERN);
  if (!match) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(match[1]);
  } catch {
    try {
      // Some models copy the JSON-escaped example from the system prompt verbatim.
      decoded = JSON.parse(match[1].replace(/\\"/g, '"'));
    } catch {
      return null;
    }
  }

  const question = normalize(decoded);
  if (!question) return null;
  return { ...question, raw: match[0] };
}

/**
 * True when the stored question markup carries this question id. Tolerant of JSON
 * whitespace: the web client's example and the model's own output differ (`"id": "x"`
 * vs `"id":"x"`), and re-asking with the same id must not create a duplicate question.
 */
export function matchesQuestionId(questionText: string, questionId: string): boolean {
  const escaped = questionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"id"\\s*:\\s*"${escaped}"`).test(questionText);
}
