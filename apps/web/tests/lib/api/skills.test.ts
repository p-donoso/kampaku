import { describe, it, expect, vi, beforeEach } from "vitest";
import * as skillsApi from "@/lib/api/skills";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  fetchJson: vi.fn(),
  getBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

describe("skills API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listSkills", () => {
    it("fetches all skills", async () => {
      const mockData = { skills: [{ slug: "qa", name: "QA Testing" }] };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await skillsApi.listSkills();

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/skills");
      expect(result).toEqual(mockData);
    });
  });

  describe("getSkill", () => {
    it("fetches a single skill by slug", async () => {
      const mockData = { slug: "qa", name: "QA Testing", capabilities: ["testing"] };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await skillsApi.getSkill("qa");

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/skills/qa");
      expect(result).toEqual(mockData);
    });

    it("encodes special characters in slug", async () => {
      const mockData = { slug: "test-skill", name: "Test" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      await skillsApi.getSkill("test/skill");

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/skills/test%2Fskill");
    });
  });

  describe("createSkill", () => {
    it("creates a new skill", async () => {
      const mockData = { slug: "new-skill", name: "New Skill" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await skillsApi.createSkill({
        slug: "new-skill",
        name: "New Skill",
        description: "A new skill",
        capabilities: ["coding"],
        tools: ["code-tool"],
      });

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/skills",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("new-skill"),
        }),
      );
      expect(result).toEqual(mockData);
    });
  });

  describe("updateSkill", () => {
    it("updates skill properties", async () => {
      const mockData = { slug: "qa", name: "Updated QA" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await skillsApi.updateSkill("qa", {
        name: "Updated QA",
        description: "Updated description",
      });

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/skills/qa",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("Updated QA"),
        }),
      );
      expect(result).toEqual(mockData);
    });
  });

  describe("deleteSkill", () => {
    it("deletes a skill", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      } as Response);

      await skillsApi.deleteSkill("old-skill");

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/v1/skills/old-skill",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("throws error on delete failure", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => "Skill is assigned",
      } as Response);

      await expect(skillsApi.deleteSkill("in-use")).rejects.toThrow();
    });
  });
});
