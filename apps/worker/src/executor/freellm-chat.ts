/**
 * @module executor/freellm-chat
 * Resilient initial chat completion handling for FreeLLMAPI with timeout and retry controls.
 */

/** Error code indicating initial LLM handshake timeout */
export const FREELLMAPI_INITIAL_TIMEOUT_CODE = "FREELLMAPI_INITIAL_TIMEOUT";

/**
 * Error raised when the FreeLLMAPI router or provider fails to respond to initial prompt within deadline.
 */
export class InitialResponseTimeoutError extends Error {
  readonly code = FREELLMAPI_INITIAL_TIMEOUT_CODE;

  /**
   * @param timeoutMs - Configured timeout duration in milliseconds.
   * @param attempts - Number of attempts made before failing.
   */
  constructor(
    readonly timeoutMs: number,
    readonly attempts: number,
  ) {
    super(
      `FreeLLMApi did not respond within ${timeoutMs}ms after ${attempts} attempt${attempts === 1 ? "" : "s"}.`,
    );
    this.name = "InitialResponseTimeoutError";
  }
}

/**
 * Inspects whether an error reflects a request timeout or abort condition.
 *
 * @param error - Caught error object or unknown rejection value.
 * @returns True if error indicates a timeout.
 */
export function isTimeoutLikeError(error: unknown): boolean {
  if (error instanceof InitialResponseTimeoutError) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("aborterror")
  );
}

/**
 * Creates an abortable timeout promise.
 */
function abortAfter(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: NodeJS.Timeout;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new InitialResponseTimeoutError(ms, 1));
    }, ms);
    timer.unref?.();
  });
  return {
    promise,
    cancel: () => clearTimeout(timer),
  };
}

/**
 * Asynchronously pauses execution.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic minimal chat client interface compatible with OpenAI chat completions.
 */
interface ChatClient {
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
}

/**
 * Invokes the initial chat completion with bounded timeout and automatic retry logic.
 *
 * @param client - OpenAI or compatible ChatClient.
 * @param request - Chat completion request parameters.
 * @param options - Timeout, retry count, and logging callbacks.
 * @returns Assistant response choice payload.
 */
export async function createInitialChatCompletion(
  client: ChatClient,
  request: Record<string, unknown>,
  options: {
    timeoutMs: number;
    maxAttempts: number;
    retryDelayMs?: number;
    log?: (line: string) => void;
  },
): Promise<unknown> {
  const log = options.log ?? (() => undefined);
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    log(
      `Initial model response: attempt ${attempt}/${options.maxAttempts} (timeout ${Math.round(options.timeoutMs / 1000)}s)…`,
    );
    try {
      const timeout = abortAfter(options.timeoutMs);
      try {
        return await Promise.race([
          client.chat.completions.create(request),
          timeout.promise,
        ]);
      } finally {
        timeout.cancel();
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const timedOut = isTimeoutLikeError(error);
      log(
        timedOut
          ? `Initial model response timed out on attempt ${attempt}.`
          : `Initial model response failed on attempt ${attempt}: ${lastError.message}`,
      );
      if (!timedOut || attempt === options.maxAttempts) throw lastError;
      log(`Retrying initial model response in ${Math.round(retryDelayMs / 1000)}s…`);
      await sleep(retryDelayMs);
    }
  }

  throw lastError ?? new InitialResponseTimeoutError(options.timeoutMs, options.maxAttempts);
}
