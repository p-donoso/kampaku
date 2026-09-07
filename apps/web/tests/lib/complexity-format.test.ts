import { describe, it, expect } from "vitest";
import { formatComplexityShort, formatComplexityDetail } from "@/lib/complexity-format";
import type { WorkItemComplexity } from "@/lib/types";

describe("complexity formatting", () => {
  describe("formatComplexityShort", () => {
    it("formats container complexity", () => {
      const complexity: WorkItemComplexity = {
        granularity: "feature" as any,
        depth: 1,
        role: "container",
        leafCount: 3,
        targetLeaves: 5,
        minLeaves: 2,
        filesUsed: 0,
        filesMax: 0,
        scriptsUsed: 0,
        scriptsMax: 0,
        descriptionChars: 0,
        minDescriptionChars: 0,
      };

      const result = formatComplexityShort(complexity);

      expect(result).toContain("feature");
      expect(result).toContain("3/5 leaves");
    });

    it("formats leaf complexity", () => {
      const complexity: WorkItemComplexity = {
        granularity: "task" as any,
        depth: 2,
        role: "leaf",
        leafCount: 0,
        targetLeaves: 0,
        minLeaves: 0,
        filesUsed: 2,
        filesMax: 3,
        scriptsUsed: 1,
        scriptsMax: 2,
        descriptionChars: 150,
        minDescriptionChars: 100,
      };

      const result = formatComplexityShort(complexity);

      expect(result).toContain("task");
      expect(result).toContain("2/3 files");
      expect(result).toContain("1/2 scripts");
    });
  });

  describe("formatComplexityDetail", () => {
    it("formats container complexity details", () => {
      const complexity: WorkItemComplexity = {
        granularity: "epic" as any,
        depth: 0,
        role: "container",
        leafCount: 10,
        targetLeaves: 15,
        minLeaves: 5,
        filesUsed: 0,
        filesMax: 0,
        scriptsUsed: 0,
        scriptsMax: 0,
        descriptionChars: 0,
        minDescriptionChars: 0,
      };

      const lines = formatComplexityDetail(complexity);

      expect(lines).toContain("Granularity: epic");
      expect(lines).toContain("Depth: 0");
      expect(lines).toContain("Role: container");
      expect(lines.some((l) => l.includes("Leaves:"))).toBe(true);
      expect(lines.some((l) => l.includes("10"))).toBe(true);
      expect(lines.some((l) => l.includes("15"))).toBe(true);
    });

    it("formats leaf complexity details", () => {
      const complexity: WorkItemComplexity = {
        granularity: "unit" as any,
        depth: 3,
        role: "leaf",
        leafCount: 0,
        targetLeaves: 0,
        minLeaves: 0,
        filesUsed: 3,
        filesMax: 3,
        scriptsUsed: 2,
        scriptsMax: 2,
        descriptionChars: 250,
        minDescriptionChars: 200,
      };

      const lines = formatComplexityDetail(complexity);

      expect(lines).toContain("Granularity: unit");
      expect(lines).toContain("Depth: 3");
      expect(lines).toContain("Role: leaf");
      expect(lines.some((l) => l.includes("Files:"))).toBe(true);
      expect(lines.some((l) => l.includes("Scripts:"))).toBe(true);
      expect(lines.some((l) => l.includes("Description:"))).toBe(true);
      expect(lines.some((l) => l.includes("250"))).toBe(true);
    });
  });
});
