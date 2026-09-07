import { describe, it, expect, vi, beforeEach } from "vitest";
import * as settingsApi from "@/lib/api/settings";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  fetchJson: vi.fn(),
  getBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

describe("settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("healthCheck", () => {
    it("returns true when core is healthy", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await settingsApi.healthCheck();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/v1/health",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    it("returns false when core is unavailable", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

      const result = await settingsApi.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe("getFilesystemSettings", () => {
    it("fetches filesystem settings", async () => {
      const mockData = { folders: [{ id: "f1", path: "/test", label: "Test" }] };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.getFilesystemSettings();

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/settings/filesystem");
      expect(result).toEqual(mockData);
    });
  });

  describe("getGlobalSystemPromptSettings", () => {
    it("fetches system prompt", async () => {
      const mockData = { prompt: "System prompt text" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.getGlobalSystemPromptSettings();

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/settings/global-system-prompt");
      expect(result).toEqual(mockData);
    });
  });

  describe("updateGlobalSystemPrompt", () => {
    it("updates system prompt", async () => {
      const mockData = { prompt: "New prompt" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.updateGlobalSystemPrompt("New prompt");

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/settings/global-system-prompt",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ prompt: "New prompt" }),
        }),
      );
      expect(result).toEqual(mockData);
    });
  });

  describe("getModelProviderSettings", () => {
    it("fetches model provider settings", async () => {
      const mockData = { provider: "freeLlmApi", freeLlmApi: { baseUrl: "http://test" } };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.getModelProviderSettings();

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/settings/model-provider");
      expect(result).toEqual(mockData);
    });
  });

  describe("updateModelProviderSettings", () => {
    it("updates provider settings with API key", async () => {
      const mockData = {
        provider: "freeLlmApi",
        protocol: "openai-v1" as const,
        baseUrl: "http://test",
        model: "test-model",
        apiKeyConfigured: true,
      };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.updateModelProviderSettings({
        provider: "freeLlmApi",
        protocol: "openai-v1",
        baseUrl: "http://test",
        model: "test-model",
        apiKeyConfigured: false,
        apiKey: "secret-key",
      });

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/settings/model-provider",
        expect.objectContaining({
          method: "PUT",
        }),
      );
      expect(result).toEqual(mockData);
    });
  });

  describe("resetBootstrap", () => {
    it("resets to bootstrap with learnings kept", async () => {
      const mockData = {
        mode: "bootstrap" as const,
        deletedAgents: ["agent1"],
        createdAgents: ["kampaku"],
        inheritedLearnings: 5,
      };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.resetBootstrap(true);

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/settings/reset-bootstrap",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ keepLearnings: true }),
        }),
      );
      expect(result).toEqual(mockData);
    });

    it("resets to bootstrap without learnings", async () => {
      const mockData = {
        mode: "bootstrap" as const,
        deletedAgents: [],
        createdAgents: ["kampaku"],
        inheritedLearnings: 0,
      };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      await settingsApi.resetBootstrap(false);

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/settings/reset-bootstrap",
        expect.objectContaining({
          body: JSON.stringify({ keepLearnings: false }),
        }),
      );
    });
  });

  describe("resetAllData", () => {
    it("performs full database reset", async () => {
      const mockData = {
        mode: "all" as const,
        deletedAgents: ["all"],
        createdAgents: [],
        inheritedLearnings: 0,
      };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.resetAllData();

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/settings/reset-all",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual(mockData);
    });
  });

  describe("getRuntimeStatus", () => {
    it("fetches runtime status", async () => {
      const mockData = {
        version: "0.1.0",
        uptime: 12345,
        environment: "development",
      };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await settingsApi.getRuntimeStatus();

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/runtime/status");
      expect(result).toEqual(mockData);
    });
  });
});
