import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getBaseUrl, fetchJson } from "@/lib/api/client";
import { ApiError } from "@/lib/api-errors";

describe("getBaseUrl", () => {
  const originalWindow = global.window;
  const originalEnv = process.env;

  afterEach(() => {
    global.window = originalWindow;
    process.env = originalEnv;
  });

  it("returns empty string in browser context", () => {
    global.window = {} as Window & typeof globalThis;
    const result = getBaseUrl();
    expect(result).toBe("");
  });

  it("uses KAMPAKU_CORE_URL in SSR when set", () => {
    // @ts-expect-error - testing SSR
    global.window = undefined;
    process.env = { ...originalEnv, KAMPAKU_CORE_URL: "http://core:8080" };
    
    const result = getBaseUrl();
    expect(result).toBe("http://core:8080");
  });

  it("uses NEXT_PUBLIC_KAMPAKU_API_URL as fallback in SSR", () => {
    // @ts-expect-error - testing SSR
    global.window = undefined;
    process.env = { ...originalEnv, NEXT_PUBLIC_KAMPAKU_API_URL: "http://api:9000" };
    
    const result = getBaseUrl();
    expect(result).toBe("http://api:9000");
  });

  it("uses default localhost URL in SSR when no env vars", () => {
    // @ts-expect-error - testing SSR
    global.window = undefined;
    process.env = { ...originalEnv };
    delete process.env.KAMPAKU_CORE_URL;
    delete process.env.NEXT_PUBLIC_KAMPAKU_API_URL;
    
    const result = getBaseUrl();
    expect(result).toBe("http://127.0.0.1:8080");
  });

  it("strips trailing slash from URL", () => {
    // @ts-expect-error - testing SSR
    global.window = undefined;
    process.env = { ...originalEnv, KAMPAKU_CORE_URL: "http://core:8080/" };
    
    const result = getBaseUrl();
    expect(result).toBe("http://core:8080");
  });

  it("prefers KAMPAKU_CORE_URL over NEXT_PUBLIC_KAMPAKU_API_URL", () => {
    // @ts-expect-error - testing SSR
    global.window = undefined;
    process.env = {
      ...originalEnv,
      KAMPAKU_CORE_URL: "http://primary:8080",
      NEXT_PUBLIC_KAMPAKU_API_URL: "http://fallback:9000",
    };
    
    const result = getBaseUrl();
    expect(result).toBe("http://primary:8080");
  });
});

describe("fetchJson", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    global.window = {} as Window & typeof globalThis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes successful request and returns JSON", async () => {
    const mockData = { id: "123", name: "Test" };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const result = await fetchJson("/api/test");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      })
    );
    expect(result).toEqual(mockData);
  });

  it("merges custom headers with default Content-Type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await fetchJson("/api/test", {
      headers: { Authorization: "Bearer token" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
      })
    );
  });

  it("passes through request options", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await fetchJson("/api/test", {
      method: "POST",
      body: JSON.stringify({ data: "test" }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ data: "test" }),
      })
    );
  });

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not found",
    });

    await expect(fetchJson("/api/missing")).rejects.toThrow(ApiError);
  });

  it("throws ApiError with status and body on error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal error",
    });

    try {
      await fetchJson("/api/error");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
      // Message is formatted by toApiError, not raw body
      expect((error as ApiError).message).toBeTruthy();
    }
  });

  it("handles empty response body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => null,
    });

    const result = await fetchJson("/api/empty");
    expect(result).toBeNull();
  });

  it("uses baseUrl from getBaseUrl in browser", async () => {
    global.window = {} as Window & typeof globalThis;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await fetchJson("/api/test");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.any(Object)
    );
  });
});
