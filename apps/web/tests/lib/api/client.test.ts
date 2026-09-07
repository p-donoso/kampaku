import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getBaseUrl, fetchJson } from "@/lib/api/client";
import * as apiErrors from "@/lib/api-errors";

vi.mock("@/lib/api-errors", () => ({
  toApiError: vi.fn((path, status, body) => new Error(`API Error: ${status} at ${path}`)),
}));

describe("API client", () => {
  let originalWindow: any;
  let originalEnv: any;

  beforeEach(() => {
    originalWindow = global.window;
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
    process.env = originalEnv;
  });

  describe("getBaseUrl", () => {
    it("returns empty string in browser environment", () => {
      global.window = {} as any;
      expect(getBaseUrl()).toBe("");
    });

    it("returns KAMPAKU_CORE_URL in SSR when set", () => {
      global.window = undefined as any;
      process.env.KAMPAKU_CORE_URL = "http://core:8080";
      expect(getBaseUrl()).toBe("http://core:8080");
    });

    it("returns NEXT_PUBLIC_KAMPAKU_API_URL when CORE_URL not set", () => {
      global.window = undefined as any;
      delete process.env.KAMPAKU_CORE_URL;
      process.env.NEXT_PUBLIC_KAMPAKU_API_URL = "http://api:3000";
      expect(getBaseUrl()).toBe("http://api:3000");
    });

    it("returns default localhost in SSR when no env vars", () => {
      global.window = undefined as any;
      delete process.env.KAMPAKU_CORE_URL;
      delete process.env.NEXT_PUBLIC_KAMPAKU_API_URL;
      expect(getBaseUrl()).toBe("http://127.0.0.1:8080");
    });

    it("strips trailing slash from configured URL", () => {
      global.window = undefined as any;
      process.env.KAMPAKU_CORE_URL = "http://core:8080/";
      expect(getBaseUrl()).toBe("http://core:8080");
    });
  });

  describe("fetchJson", () => {
    it("fetches and parses JSON", async () => {
      const mockData = { result: "success" };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const result = await fetchJson("/api/test");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/test"),
        expect.objectContaining({
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          cache: "no-store",
        }),
      );
      expect(result).toEqual(mockData);
    });

    it("includes custom headers", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await fetchJson("/api/test", {
        headers: { Authorization: "Bearer token" },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer token",
          }),
        }),
      );
    });

    it("merges init options", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await fetchJson("/api/test", {
        method: "POST",
        body: JSON.stringify({ data: "test" }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        }),
      );
    });

    it("throws API error on non-ok response", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });

      await expect(fetchJson("/api/missing")).rejects.toThrow("API Error: 404");
      expect(apiErrors.toApiError).toHaveBeenCalledWith("/api/missing", 404, "Not found");
    });

    it("sets no-store cache", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await fetchJson("/api/test");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });
});
