import { describe, it, expect } from "vitest";
import type { SkillRecord } from "@/lib/types";
import {
  computeSkillCounts,
  filterSkills,
  sortSkills,
} from "@/lib/skill-roster-utils";

describe("skill-roster-utils", () => {
  const mockSkill = (overrides: Partial<SkillRecord> = {}): SkillRecord => ({
    slug: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    capabilities: ["coding"],
    tools: ["tool1"],
    promptFragment: "",
    default: false,
    assignedAgentSlugs: [],
    ...overrides,
  });

  describe("computeSkillCounts", () => {
    it("counts total, assigned, and unassigned skills", () => {
      const skills = [
        mockSkill({ assignedAgentSlugs: ["agent1"] }),
        mockSkill({ assignedAgentSlugs: [] }),
        mockSkill({ assignedAgentSlugs: ["agent2", "agent3"] }),
      ];
      const counts = computeSkillCounts(skills);
      expect(counts.total).toBe(3);
      expect(counts.assigned).toBe(2);
      expect(counts.unassigned).toBe(1);
    });

    it("handles undefined assignedAgentSlugs", () => {
      const skills = [
        mockSkill({ assignedAgentSlugs: undefined }),
        mockSkill({ assignedAgentSlugs: ["agent1"] }),
      ];
      const counts = computeSkillCounts(skills);
      expect(counts.total).toBe(2);
      expect(counts.assigned).toBe(1);
      expect(counts.unassigned).toBe(1);
    });
  });

  describe("filterSkills", () => {
    it("returns all skills for 'all' filter", () => {
      const skills = [
        mockSkill({ slug: "s1" }),
        mockSkill({ slug: "s2" }),
      ];
      const filtered = filterSkills(skills, "all", "");
      expect(filtered).toHaveLength(2);
    });

    it("filters by assigned", () => {
      const skills = [
        mockSkill({ slug: "s1", assignedAgentSlugs: ["agent1"] }),
        mockSkill({ slug: "s2", assignedAgentSlugs: [] }),
      ];
      const filtered = filterSkills(skills, "assigned", "");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].slug).toBe("s1");
    });

    it("filters by unassigned", () => {
      const skills = [
        mockSkill({ slug: "s1", assignedAgentSlugs: ["agent1"] }),
        mockSkill({ slug: "s2", assignedAgentSlugs: [] }),
      ];
      const filtered = filterSkills(skills, "unassigned", "");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].slug).toBe("s2");
    });

    it("filters by search query in slug", () => {
      const skills = [
        mockSkill({ slug: "python-skill" }),
        mockSkill({ slug: "javascript-skill" }),
      ];
      const filtered = filterSkills(skills, "all", "python");
      expect(filtered).toHaveLength(1);
      expect(filtered[0].slug).toBe("python-skill");
    });

    it("filters by search query in name", () => {
      const skills = [
        mockSkill({ name: "Python Mastery" }),
        mockSkill({ name: "JavaScript Expert" }),
      ];
      const filtered = filterSkills(skills, "all", "python");
      expect(filtered).toHaveLength(1);
    });

    it("filters by search query in description", () => {
      const skills = [
        mockSkill({ description: "Expert in Python programming" }),
        mockSkill({ description: "Expert in JavaScript" }),
      ];
      const filtered = filterSkills(skills, "all", "python");
      expect(filtered).toHaveLength(1);
    });

    it("filters by search query in capabilities", () => {
      const skills = [
        mockSkill({ capabilities: ["python", "data-science"] }),
        mockSkill({ capabilities: ["javascript", "web"] }),
      ];
      const filtered = filterSkills(skills, "all", "python");
      expect(filtered).toHaveLength(1);
    });

    it("filters by search query in tools", () => {
      const skills = [
        mockSkill({ tools: ["pytest", "mypy"] }),
        mockSkill({ tools: ["jest", "eslint"] }),
      ];
      const filtered = filterSkills(skills, "all", "pytest");
      expect(filtered).toHaveLength(1);
    });

    it("handles empty search query", () => {
      const skills = [
        mockSkill({ slug: "s1" }),
        mockSkill({ slug: "s2" }),
      ];
      const filtered = filterSkills(skills, "all", "");
      expect(filtered).toHaveLength(2);
    });
  });

  describe("sortSkills", () => {
    it("sorts by name ascending", () => {
      const skills = [
        mockSkill({ slug: "s1", name: "Zebra" }),
        mockSkill({ slug: "s2", name: "Alpha" }),
      ];
      const sorted = sortSkills(skills, "name", false);
      expect(sorted[0].name).toBe("Alpha");
    });

    it("sorts by name descending", () => {
      const skills = [
        mockSkill({ slug: "s1", name: "Alpha" }),
        mockSkill({ slug: "s2", name: "Zebra" }),
      ];
      const sorted = sortSkills(skills, "name", true);
      expect(sorted[0].name).toBe("Zebra");
    });

    it("sorts by slug ascending", () => {
      const skills = [
        mockSkill({ slug: "zebra-skill" }),
        mockSkill({ slug: "alpha-skill" }),
      ];
      const sorted = sortSkills(skills, "slug", false);
      expect(sorted[0].slug).toBe("alpha-skill");
    });

    it("sorts by agents ascending", () => {
      const skills = [
        mockSkill({ slug: "s1", assignedAgentSlugs: ["a1", "a2", "a3"] }),
        mockSkill({ slug: "s2", assignedAgentSlugs: ["a1"] }),
      ];
      const sorted = sortSkills(skills, "agents", false);
      expect(sorted[0].slug).toBe("s2");
    });

    it("sorts by agents descending", () => {
      const skills = [
        mockSkill({ slug: "s1", assignedAgentSlugs: ["a1"] }),
        mockSkill({ slug: "s2", assignedAgentSlugs: ["a1", "a2", "a3"] }),
      ];
      const sorted = sortSkills(skills, "agents", true);
      expect(sorted[0].slug).toBe("s2");
    });
  });
});
