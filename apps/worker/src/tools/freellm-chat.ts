export const FREELLMAPI_INITIAL_TIMEOUT_CODE = "FREELLMAPI_INITIAL_TIMEOUT";

export class InitialResponseTimeoutError extends Error {
  readonly code = FREELLMAPI_INITIAL_TIMEOUT_CODE;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ChatClient {
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
}

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
