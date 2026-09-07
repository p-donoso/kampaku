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
}

/**
 * Base HTTP client providing standardized request serialization, status checking, and error handling.
 */
export abstract class BaseHttpClient {
  protected readonly baseUrl: string;
  protected readonly fetchFn: typeof fetch;

  /**
   * Initializes the base HTTP client.
   * @param options - Configuration options including baseUrl and fetch function.
   */
  constructor(options: BaseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchFn = options.fetch ?? fetch;
  }

  /**
   * Executes a raw HTTP request.
   * @param path - API endpoint path relative to baseUrl.
   * @param init - Standard RequestInit options.
   * @returns The raw fetch Response.
   */
  protected async request(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    return this.fetchFn(url, init);
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
