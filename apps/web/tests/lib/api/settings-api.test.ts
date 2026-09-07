import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getSettings,
  updateSettings,
} from "../../../src/lib/api/settings";

describe("settings API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getSettings fetches current settings", async () => {
    const mockSettings = { freellmApiBaseUrl: "https://api.example.com" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockSettings,
    });

    const result = await getSettings();
    expect(result).toEqual(mockSettings);
  });

  it("updateSettings sends PATCH request", async () => {
    const mockUpdated = { freellmApiBaseUrl: "https://new.api.url" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    });

    const result = await updateSettings({ freellmApiBaseUrl: "https://new.api.url" });
    expect(result).toEqual(mockUpdated);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/settings",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});
