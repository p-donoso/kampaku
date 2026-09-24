/**
 * Context-window detection, so a turn that cannot fit is never scored as if it had.
 *
 * Why this exists. Five baseline runs of eval suite 01 were taken before anyone looked at the
 * endpoint's own configuration, and every one of them was measured through a truncated turn:
 *
 * ```text
 * llama-server ... -c 4096 -np 1 ... --context-shift --keep 4
 * ollama ps            ->  CONTEXT 4096
 * ollama show          ->  context length 32768   # the model supports 32k
 * ```
 *
 * The model supported 32 768 tokens and was served at 4 096, with `--context-shift` discarding the
 * oldest tokens once full. Measured: any prompt above the limit reports a pinned `prompt_eval_count`
 * (2 050), and a fact placed at the start of a long prompt is retrieved when the prompt fits and is
 * gone when it does not. Nothing surfaced in the API response, the CLI, or the logs.
 *
 * **The orchestrator's own system prompt measured 4 086 tokens against that 4 096 limit**, so the
 * durable-state block, the history and the operator's question were dropped from the front on every
 * turn of every run. The suite that this program measured was failing for a reason no run could see.
 *
 * A truncated turn is indistinguishable from a model that read the whole prompt and answered badly, so
 * it cannot be scored. Two mechanisms, because neither alone is enough:
 *
 * 1. **Pre-flight.** When the effective limit is known — configured, or learned from an earlier
 *    truncation in this process — refuse the turn with the numbers instead of sending it.
 * 2. **Post-flight.** Every OpenAI-compatible response reports `usage.prompt_tokens`. Comparing that
 *    against a local estimate detects a truncation that pre-flight could not predict, and the reported
 *    value is approximately the endpoint's cap, so the next turn gets pre-flight protection.
 *
 * Neither mechanism guesses at the endpoint's API. `usage` is part of the documented contract, which
 * is why this works against any compatible endpoint rather than against one vendor.
 */

/**
 * The endpoint's own `usage.prompt_tokens` for a turn that was cut short.
 *
 * `reported` is what the endpoint says it read; `estimated` is what the turn actually contained.
 * A truncation is a large gap, not a small one, so the threshold is deliberately loose: a rough
 * estimate that is 40% off must not raise a false alarm, while a cut to half or less must.
 */
export interface ContextTruncation {
  reportedTokens: number;
  estimatedTokens: number;
  /** The turn this was observed on, for the operator to correlate with a run log. */
  note: string;
}

/** Fraction of the estimate below which a reported count means the prompt was cut. */
const TRUNCATION_RATIO = 0.6;

/**
 * A deliberately rough token estimate, in characters per token.
 *
 * Measured on this repository's own prompt text: 19 984 chars → 4 086 tokens, about **4.9** chars per
 * token. Random-word filler tokenizes far worse, about **2.0**, because each nonsense word splits into
 * several tokens. So the constant is set low — erring toward overestimating the token count, which
 * errs toward refusing a turn rather than sending one that gets cut.
 *
 * The estimate is only used to compare against the endpoint's reported count and to warn an operator.
 * It is never the sole reason a turn is refused: refusal needs a real limit, from configuration or
 * from a measurement. That distinction is what keeps this from turning a heuristic into a lock.
 */
const CHARS_PER_TOKEN = 3;

/** Tokens held back for the reply, so a prompt is not allowed to consume the whole window. */
export const DEFAULT_REPLY_RESERVE_TOKENS = 1024;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((total, message) => total + estimateTokens(message.content) + 4, 0);
}

/**
 * Did the endpoint read less than we sent?
 *
 * Only called when the endpoint reported a count that is materially below the estimate. Silence is the
 * default: a false accusation against a turn that fit would be its own kind of dishonesty, and this
 * module exists because of exactly that class of error.
 */
export function looksTruncated(input: {
  reportedTokens: number;
  estimatedTokens: number;
}): boolean {
  const { reportedTokens, estimatedTokens } = input;
  if (!Number.isFinite(reportedTokens) || reportedTokens <= 0) return false;
  if (!Number.isFinite(estimatedTokens) || estimatedTokens <= 0) return false;
  return reportedTokens < estimatedTokens * TRUNCATION_RATIO;
}

/** Thrown before a request when the assembled turn cannot fit the endpoint's effective context. */
export class ContextOverflowError extends Error {
  constructor(
    readonly neededTokens: number,
    readonly limitTokens: number,
    readonly source: "configured" | "learned",
  ) {
    super(
      `This turn needs about ${neededTokens.toLocaleString("en-US")} tokens but the endpoint's context ` +
        `is ${limitTokens.toLocaleString("en-US")}, so it would be silently truncated: the oldest ` +
        `part of the prompt is discarded before the model reads it, and the reply would be scored as ` +
        `if the whole prompt had been read. ` +
        (source === "learned"
          ? "The limit was measured from an earlier truncated turn on this endpoint. "
          : "The limit comes from KAMPAKU_MODEL_CONTEXT_TOKENS. ") +
        "Reduce the turn, or raise the endpoint's context (for Ollama, `OLLAMA_CONTEXT_LENGTH` or a " +
        "per-request `num_ctx`) and restart it as an endpoint able to serve this workload.",
    );
    this.name = "ContextOverflowError";
  }
}

/**
 * The text an operator sees after a turn whose prompt was cut, in the same spirit as `tools: none`.
 *
 * A truncating endpoint is a capability gap of the endpoint, not a defect of the reply, and the run
 * that produced it is not a measurement. Saying so is the point: five runs were scored without it.
 */
export function formatTruncationNotice(truncation: ContextTruncation): string {
  return (
    `Context truncated by the endpoint: it read ${truncation.reportedTokens.toLocaleString("en-US")} ` +
    `of roughly ${truncation.estimatedTokens.toLocaleString("en-US")} tokens sent. The oldest part of ` +
    "this turn was discarded before the model saw it, so the reply describes a partial prompt and this " +
    "turn is not a valid measurement."
  );
}
