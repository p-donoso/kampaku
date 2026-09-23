/**
 * Exception raised during HTTP client communication with the Core API.
 */
export class CoreClientError extends Error {
  /**
   * @param message - Descriptive error message.
   * @param status - HTTP response status code.
   * @param body - Raw response body string if available.
   */
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "CoreClientError";
  }
}

/**
 * Common configuration options for HTTP client instances.
 */
export interface BaseClientOptions {
  /** Target base URL for the backend API. */
  baseUrl: string;
  /** Custom fetch implementation (e.g. for testing or SSR). */
  fetch?: typeof fetch;
  /**
   * Per-request timeout in milliseconds, applied when a caller passes no signal of its own.
   *
   * This must be set explicitly: without it the runtime applies its own default headers
   * timeout, which is far shorter than a real agent turn. A chat request that runs several
   * model and tool iterations on a large reasoning model can legitimately take minutes, and
   * when the client gives up first the operator sees a crash while the server keeps working —
   * partial side effects with no record of the turn.
   */
  timeoutMs?: number;
}

/**
 * Base HTTP client providing standardized request serialization, status checking, and error handling.
 */
/**
 * How long a caller should wait before assuming a request will not complete.
 *
 * An abort signal alone is NOT enough to raise this on this runtime: the fetch implementation
 * applies its own headers timeout, and a request still waiting for response headers is killed by
 * that limit even when a longer signal is supplied. Measured directly: a chat turn was killed at
 * 300s while the configured ceiling was 1800s.
 */
let transportConfiguredForMs: number | undefined;

/**
 * Best-effort: raise the transport's own timeouts to match the caller's intent. Kept optional so
 * the client still works (with the signal as the only ceiling) if the transport module is absent.
 */
async function ensureTransportTimeout(timeoutMs: number): Promise<void> {
  if (transportConfiguredForMs !== undefined && transportConfiguredForMs >= timeoutMs) return;
  try {
    const undici = (await import("undici")) as unknown as {
      Agent?: new (options: Record<string, number>) => unknown;
      setGlobalDispatcher?: (dispatcher: unknown) => void;
    };
    if (!undici.Agent || !undici.setGlobalDispatcher) return;
    undici.setGlobalDispatcher(
      new undici.Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs }),
    );
    transportConfiguredForMs = timeoutMs;
  } catch {
    // No transport module: the abort signal remains the only ceiling.
  }
}

/**
 * Builds a client error message that carries the server's own explanation.
 *
 * The response body was already captured and stored on the error, but never put into the message, so
 * every failure surfaced as a status code alone. Measured: `kampaku questions answer <id>` printed
 * `Failed to answer question: 400` while the body said `Only the current recipient can answer this
 * question.` The useful half was discarded, and the operator had to leave the CLI to learn what
 * happened — the same "signal satisfied, meaning absent" shape this platform is being probed for.
 */
export function describeHttpError(
  contextMessage: string | undefined,
  status: number,
  body: string,
): string {
  const prefix = contextMessage ? `${contextMessage}: ` : "Request failed: ";
  let detail = (body ?? "").trim();
  if (detail) {
    try {
      const parsed = JSON.parse(detail) as { error?: unknown; message?: unknown };
      const value = parsed.error ?? parsed.message;
      if (typeof value === "string") detail = value;
      else if (value !== undefined) detail = JSON.stringify(value);
    } catch {
      // Plain-text body: use it as-is.
    }
  }
  if (!detail) return `${prefix}${status}`;
  const truncated = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;
  return `${prefix}${status} — ${truncated}`;
}

export abstract class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly fetchFn: typeof fetch;
  protected readonly timeoutMs?: number;

  /**
   * Initializes the base HTTP client.
   * @param options - Configuration options including baseUrl and fetch function.
   */
  constructor(options: BaseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchFn = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  /**
   * Executes a raw HTTP request.
   * @param path - API endpoint path relative to baseUrl.
   * @param init - Standard RequestInit options.
   * @returns The raw fetch Response.
   */
  protected async request(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const requestInit: RequestInit = { ...init };
    if (this.timeoutMs) {
      await ensureTransportTimeout(this.timeoutMs);
      if (!requestInit.signal) {
        requestInit.signal = AbortSignal.timeout(this.timeoutMs);
      }
    }

    const startedAt = Date.now();
    try {
      return await this.fetchFn(url, requestInit);
    } catch (error) {
      // A transport failure must read as a stated condition, not a raw stack trace the operator
      // has to decode. It must also report what actually happened: an earlier version of this
      // reported the *configured* ceiling instead of the elapsed time, which stated "timed out
      // after 1800s" for a request that the transport had killed at 300s.
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
      const transportTimeout =
        cause?.code === "UND_ERR_HEADERS_TIMEOUT" || cause?.code === "UND_ERR_BODY_TIMEOUT";
      const signalFired = requestInit.signal?.aborted === true;

      if (signalFired || transportTimeout) {
        const configured = this.timeoutMs ? Math.round(this.timeoutMs / 1000) : undefined;
        const hint = transportTimeout
          ? " The transport's own timeout fired before the configured ceiling" +
            " (transport headers timeout vs KAMPAKU_CLIENT_TIMEOUT_MS)."
          : "";
        throw new CoreClientError(
          `Request to ${url} timed out after ${elapsedSeconds}s` +
            `${configured ? ` (configured ceiling ${configured}s)` : ""}.${hint} ` +
            "The operation may still be running on Core; check `kampaku projects list`, " +
            "`kampaku agents tree` and the conversation before retrying.",
          408,
        );
      }
      throw new CoreClientError(
        `Request to ${url} failed after ${elapsedSeconds}s: ${
          error instanceof Error ? error.message : String(error)
        }`,
        0,
      );
    }
  }

  /**
   * Performs an HTTP request and parses the JSON response payload.
   * @param path - API endpoint path.
   * @param init - Request options.
   * @param contextMessage - Context string included in error messages on failure.
   * @returns The deserialized response object.
   */
  protected async json<T>(path: string, init?: RequestInit, contextMessage?: string): Promise<T> {
    const res = await this.request(path, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new CoreClientError(describeHttpError(contextMessage, res.status, body), res.status, body);
    }
    if (res.status === 204) {
      return undefined as unknown as T;
    }
    const text = await res.text();
    if (!text || text.trim() === "") {
      return undefined as unknown as T;
    }
    return JSON.parse(text) as T;
  }

  /**
   * Performs an HTTP request, returning undefined if 404 is encountered.
   * @param path - API endpoint path.
   * @param init - Request options.
   * @param contextMessage - Context string for error reporting.
   * @returns Deserialized payload or undefined.
   */
  protected async jsonOptional<T>(path: string, init?: RequestInit, contextMessage?: string): Promise<T | undefined> {
    const res = await this.request(path, init);
    if (res.status === 404) {
      return undefined;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new CoreClientError(describeHttpError(contextMessage, res.status, body), res.status, body);
    }
    if (res.status === 204) {
      return undefined;
    }
    const text = await res.text();
    if (!text || text.trim() === "") {
      return undefined;
    }
    return JSON.parse(text) as T;
  }

  /**
   * Executes an HTTP request expecting no response body.
   * @param path - API endpoint path.
   * @param init - Request options.
   * @param contextMessage - Context message on failure.
   */
  protected async executeVoid(path: string, init?: RequestInit, contextMessage?: string): Promise<void> {
    const res = await this.request(path, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new CoreClientError(describeHttpError(contextMessage, res.status, body), res.status, body);
    }
  }

  /**
   * Sends a GET request and deserializes JSON response.
   */
  protected async get<T>(path: string, contextMessage?: string): Promise<T> {
    return this.json<T>(path, { method: "GET" }, contextMessage);
  }

  /**
   * Sends a GET request, returning undefined on 404.
   */
  protected async getOptional<T>(path: string, contextMessage?: string): Promise<T | undefined> {
    return this.jsonOptional<T>(path, { method: "GET" }, contextMessage);
  }

  /**
   * Sends a POST request with optional JSON payload.
   */
  protected async post<T>(path: string, body?: unknown, contextMessage?: string): Promise<T> {
    return this.json<T>(
      path,
      {
        method: "POST",
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      contextMessage,
    );
  }

  /**
   * Sends a PUT request with optional JSON payload.
   */
  protected async put<T>(path: string, body?: unknown, contextMessage?: string): Promise<T> {
    return this.json<T>(
      path,
      {
        method: "PUT",
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      contextMessage,
    );
  }

  /**
   * Sends a PATCH request with optional JSON payload.
   */
  protected async patch<T>(path: string, body?: unknown, contextMessage?: string): Promise<T> {
    return this.json<T>(
      path,
      {
        method: "PATCH",
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      contextMessage,
    );
  }

  /**
   * Sends a DELETE request with optional JSON payload.
   */
  protected async delete<T = void>(path: string, body?: unknown, contextMessage?: string): Promise<T> {
    const res = await this.request(path, {
      method: "DELETE",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      throw new CoreClientError(
        describeHttpError(contextMessage, res.status, responseBody),
        res.status,
        responseBody,
      );
    }
    if (res.status === 204) {
      return undefined as unknown as T;
    }
    const text = await res.text();
    if (!text || text.trim() === "") {
      return undefined as unknown as T;
    }
    return JSON.parse(text) as T;
  }
}
