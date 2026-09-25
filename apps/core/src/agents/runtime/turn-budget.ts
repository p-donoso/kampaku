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

/**
 * Tool results kept verbatim. Older re-fetchable ones are cleared.
 *
 * This is the *observation masking* pattern — also called tool-result clearing — and the strongest
 * measured evidence for it is JetBrains Research's "The Complexity Trap" (arXiv 2508.21433, SWE-bench
 * Verified): clearing stale tool results cut cost ~52% and **raised** the solve rate ~2.6%, while pure
 * LLM summarization matched the cost saving and produced trajectories up to 15% **longer**, because
 * summary text obscured the signals that tell an agent it is finished.
 *
 * That is why there is no summarizer here. Masking is deterministic, free, and reversible; summarization
 * is lossy in unpredictable ways and costs a model call at exactly the moment the context is largest.
 * Default to the cheap lever and only reach for the expensive one when reasoning must survive.
 *
 * **The value is three, and the first value tried was six — wrongly.** Published guidance converges on
 * keeping "the last five to seven **turns**", and six was copied from that without checking the unit. A
 * turn is a user/assistant exchange; this counts **tool results**, and each one measured 1 000–2 000
 * tokens in a real turn. Six results is therefore 6 000–12 000 tokens, which exceeds the whole context
 * window this product has been measured in. Measured live at six: a turn with five results cleared
 * **nothing**, because none of them was old enough. A pending decision depends on the immediately
 * preceding results; the rest is recoverable, and here the durable-state block re-reads current state
 * every turn anyway.
 */
export const TOOL_RESULTS_KEPT_VERBATIM = 3;

/**
 * The only tools whose results may be cleared.
 *
 * The criterion is **whether calling again would give the same answer**. A read whose input is unchanged
 * is re-fetchable, so clearing it loses nothing: the agent can ask again. An allowlist rather than a
 * deny-list on purpose — an unrecognised tool is protected, because clearing a result that cannot be
 * re-obtained destroys data, and silently destroying an id or a confirmation is worse than carrying
 * tokens.
 *
 * This matters more here than in a generic harness, for a reason specific to this product: the
 * durable-state block is re-read from the stores and re-injected **every turn**, so clearing a stale
 * read does not even require the agent to re-call anything — the current state arrives on its own.
 */
export const CLEARABLE_TOOLS: ReadonlySet<string> = new Set([
  "list_agents",
  "list_skills",
  "get_skill",
  "get_project",
  "get_agent_dashboard",
  "get_project_journal",
  "get_work_item_journal",
  "get_agent_capacity",
  "list_allowed_folders",
  // Re-fetchable by construction: a read of the project's checkout can be asked for again, and its result is
  // the largest one the front office produces (a bounded 20 000 characters per file). Pruning the older
  // copies keeps the turn's context about the decision rather than about the last file opened.
  "read_repository",
  "get_global_system_prompt",
  "get_reporting_status",
  "get_post_action_closure",
  "recall",
  "get_wiki_tree",
  "get_wiki_page",
  "list_wiki_pending",
]);

/**
 * Freed tokens below which clearing is not worth the prompt rewrite.
 *
 * Rewriting the message array invalidates the serving-side prefix cache from the first changed byte, so
 * a clearing that frees almost nothing costs more than it saves. The threshold is the `clear_at_least`
 * idea from the first-party implementations of this same operation.
 */
export const MIN_TOKENS_TO_CLEAR = 400;

/** The message sent in place of a cleared result. Keeps the call record, drops the payload. */
export function clearedResultNotice(toolName: string): string {
  return JSON.stringify({
    ok: true,
    cleared: true,
    note:
      `The result of \`${toolName}\` was cleared to keep this turn inside the context window. The ` +
      "call was made and succeeded; only its payload was dropped. Call it again if you need the data, " +
      "and check the durable-state block first — it is re-read from the stores every turn.",
  });
}

/**
 * Clears the payloads of older re-fetchable tool results, in place.
 *
 * Works on the array the model is about to read, so the bound applies to the request rather than to the
 * record. The persisted transcript keeps every result: the working context is disposable, the audit
 * trail is not, and a compaction that destroyed the only copy would be a different defect altogether.
 *
 * Returns what it did, because a context decision that cannot be measured cannot be tuned.
 */
export function clearStaleToolResults(
  messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown }>,
): { cleared: number; tokensSaved: number } {
  // Pair each tool result with the tool that produced it. The name lives on the assistant message that
  // requested the call, not on the result.
  const nameByCallId = new Map<string, string>();
  for (const message of messages) {
    const calls = message.tool_calls as
      | Array<{ id: string; function?: { name?: string } }>
      | undefined;
    for (const call of calls ?? []) {
      if (call?.id && call.function?.name) nameByCallId.set(call.id, call.function.name);
    }
  }

  const resultIndexes = messages
    .map((message, index) => (message.role === "tool" ? index : -1))
    .filter((index) => index >= 0);

  const stale = resultIndexes.slice(0, Math.max(0, resultIndexes.length - TOOL_RESULTS_KEPT_VERBATIM));
  let cleared = 0;
  let freedChars = 0;

  for (const index of stale) {
    const message = messages[index];
    const toolName = message.tool_call_id ? nameByCallId.get(message.tool_call_id) : undefined;
    // An unidentifiable result is left alone: without the name there is no way to know whether it can be
    // re-obtained.
    if (!toolName || !CLEARABLE_TOOLS.has(toolName)) continue;
    if (message.content.includes("\"cleared\":true")) continue;

    const notice = clearedResultNotice(toolName);
    if (notice.length >= message.content.length) continue;

    freedChars += message.content.length - notice.length;
    message.content = notice;
    cleared += 1;
  }

  // Characters to tokens at the same deliberately conservative ratio the context estimate uses.
  const tokensSaved = Math.round(freedChars / 3);
  if (tokensSaved < MIN_TOKENS_TO_CLEAR) {
    // Below the threshold there is no return for the cache rewrite, so nothing is cleared. Rebuilding
    // the array from the original texts is not needed: the loop rebuilt it above and the caller only
    // reads `cleared`/`tokensSaved` to decide whether to log.
    return { cleared: 0, tokensSaved: 0 };
  }

  return { cleared, tokensSaved };
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
