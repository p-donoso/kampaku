/**
 * Keeping a tool-calling turn from inflating itself.
 *
 * Why this exists. Suite 01's turn was refused for needing ~14 011 tokens, and measuring the
 * conversation it left behind showed where the weight actually was:
 *
 * ```text
 *    84 user
 *    82 assistant
 *  2725 tool  list_agents
 *   117 tool  get_agent_dashboard
 *  9575 tool  list_skills          <- 62% of all tool weight
 *    45 tool  get_project_journal
 *   135 tool  get_agent_dashboard  (a different agent)
 *  2725 tool  list_agents          <- byte-identical to the first
 * ```
 *
 * 15 322 characters of tool results, of which **12 300 — 80% — were either the whole skill catalog or a
 * literal duplicate**. Four runs of prompt tuning had been aimed at the system prompt, which is the
 * second-largest item; the largest was the loop appending every result verbatim, including the same
 * result twice.
 *
 * Two defects, and they need different fixes:
 *
 * - **A repeat call is not new information.** Re-sending an identical result costs its full size and
 *   tells the model nothing. The second copy is withheld and replaced by a pointer to the first.
 * - **A result can be larger than the decision it informs.** A safety net bounds what a single result
 *   may contribute, and says so honestly instead of silently cutting. The threshold is deliberately
 *   generous, because the fix for a genuinely oversized result belongs in that tool's own contract —
 *   `list_skills` returning 36 full descriptions to answer "what skills exist" is a tool defect, not
 *   something to paper over here.
 */

/** Characters one tool result may contribute to the assembled turn before the safety net trims it. */
export const MAX_TOOL_RESULT_CHARS = 8_000;

/** Characters of that result kept when the net trips. */
export const TOOL_RESULT_PREVIEW_CHARS = 6_000;

/**
 * The key a repeat call is detected by: the tool and its exact arguments.
 *
 * Arguments are compared as the string the model produced. Two calls that differ only in whitespace or
 * key order are the same call in intent and different here, which is the conservative direction: a
 * missed duplicate costs tokens, while collapsing two genuinely different calls would hide information
 * from the decision.
 */
export function toolCallKey(toolName: string, args: string): string {
  return `${toolName}\u0000${args}`;
}

/**
 * The message sent in place of a repeat call's result.
 *
 * It carries no content on purpose. The result is already in the turn, one iteration up, and the point
 * of the substitution is that repeating it is waste. What the model needs is the fact that nothing new
 * arrived, so it stops waiting for a different answer.
 */
export function duplicateCallNotice(toolName: string): string {
  return JSON.stringify({
    ok: true,
    duplicate: true,
    note:
      `\`${toolName}\` was already called with these exact arguments earlier in this turn. Its result ` +
      "is unchanged and appears above; nothing was executed a second time. Read that result rather " +
      "than expecting a different one, and do not repeat this call.",
  });
}

/**
 * Bounds one result, saying what was omitted.
 *
 * The envelope stays valid JSON and the preview stays a string, so whatever parses it still can. What is
 * never done is a silent cut: a model handed a truncated result without being told would treat it as
 * complete, which is the same failure as the endpoint truncating a prompt and reporting nothing.
 */
export function boundToolResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) return content;
  return JSON.stringify({
    ok: true,
    output_truncated: true,
    chars: content.length,
    shown: TOOL_RESULT_PREVIEW_CHARS,
    note:
      `This result was ${content.length.toLocaleString("en-US")} characters, larger than the ` +
      `${MAX_TOOL_RESULT_CHARS.toLocaleString("en-US")}-character limit for one tool result, so the ` +
      `first ${TOOL_RESULT_PREVIEW_CHARS.toLocaleString("en-US")} are shown below and the rest is ` +
      "omitted. If you need the omitted part, call a more specific tool or ask for fewer records " +
      "rather than repeating this call.",
    preview: content.slice(0, TOOL_RESULT_PREVIEW_CHARS),
  });
}

/** Per-turn bookkeeping for the loop. One instance per user turn, never shared across turns. */
export class TurnToolCalls {
  private readonly seen = new Map<string, true>();

  /** Registers a call. Returns true when this exact call has already happened this turn. */
  isRepeat(toolName: string, args: string): boolean {
    const key = toolCallKey(toolName, args);
    if (this.seen.has(key)) return true;
    this.seen.set(key, true);
    return false;
  }

  get size(): number {
    return this.seen.size;
  }
}
