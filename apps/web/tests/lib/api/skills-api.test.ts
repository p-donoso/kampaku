import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  listSkills,
  getSkill,
  assignSkillToAgent,
  unassignSkillFromAgent,
} from "../../../src/lib/api/skills";

describe("skills API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listSkills fetches all skills", async () => {
    const mockSkills = [{ slug: "skill-1", name: "Test Skill" }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ skills: mockSkills }),
    });

    const result = await listSkills();
    expect(result.skills).toEqual(mockSkills);
  });

  it("getSkill fetches single skill", async () => {
    const mockSkill = { slug: "skill-1", name: "Test Skill" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockSkill,
    });

    const result = await getSkill("skill-1");
    expect(result).toEqual(mockSkill);
  });

  it("assignSkillToAgent posts assignment", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await assignSkillToAgent("agent-1", "skill-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/agents/agent-1/skills",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("unassignSkillFromAgent sends DELETE request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "",
    });

    await unassignSkillFromAgent("agent-1", "skill-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/agents/agent-1/skills/skill-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
