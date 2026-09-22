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
    if (this.timeoutMs && !requestInit.signal) {
      requestInit.signal = AbortSignal.timeout(this.timeoutMs);
    }

    try {
      return await this.fetchFn(url, requestInit);
    } catch (error) {
      // A transport failure must read as a stated condition, not as a raw stack trace the
      // operator has to decode. The old behaviour surfaced `HeadersTimeoutError` with no hint
      // that a knob exists, which is indistinguishable from an outage.
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
      const timedOut =
        requestInit.signal?.aborted === true ||
        cause?.code === "UND_ERR_HEADERS_TIMEOUT" ||
        cause?.code === "UND_ERR_BODY_TIMEOUT";
      if (timedOut) {
        const seconds = this.timeoutMs ? Math.round(this.timeoutMs / 1000) : undefined;
        throw new CoreClientError(
          `Request to ${url} timed out${
            seconds ? ` after ${seconds}s` : ""
          } (KAMPAKU_CLIENT_TIMEOUT_MS). The operation may still be running on Core; ` +
            "check `kampaku projects list`, `kampaku agents tree` and the conversation before retrying.",
          408,
        );
      }
      throw new CoreClientError(
        `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
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
      const prefix = contextMessage ? `${contextMessage}: ` : "Request failed: ";
      throw new CoreClientError(`${prefix}${res.status}`, res.status, body);
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
      const prefix = contextMessage ? `${contextMessage}: ` : "Request failed: ";
      throw new CoreClientError(`${prefix}${res.status}`, res.status, body);
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
      const prefix = contextMessage ? `${contextMessage}: ` : "Request failed: ";
      throw new CoreClientError(`${prefix}${res.status}`, res.status, body);
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
      const prefix = contextMessage ? `${contextMessage}: ` : "Request failed: ";
      throw new CoreClientError(`${prefix}${res.status}`, res.status, responseBody);
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
