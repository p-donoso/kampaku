import { describe, it, expect } from "vitest";
import { formatComplexityShort, formatComplexityDetail } from "../../../src/lib/complexity-format";

describe("complexity formatting", () => {
  it("formats container complexity short", () => {
    const complexity = {
      role: "container" as const,
      granularity: "coarse",
      leafCount: 3,
      targetLeaves: 5,
      minLeaves: 2,
      depth: 0,
    };
    const result = formatComplexityShort(complexity);
    expect(result).toContain("coarse");
    expect(result).toContain("3/5 leaves");
  });

  it("formats leaf complexity short", () => {
    const complexity = {
      role: "leaf" as const,
      granularity: "micro",
      filesUsed: 2,
      filesMax: 5,
      scriptsUsed: 1,
      scriptsMax: 3,
      depth: 1,
    };
    const result = formatComplexityShort(complexity);
    expect(result).toContain("micro");
    expect(result).toContain("2/5 files");
    expect(result).toContain("1/3 scripts");
  });

  it("formats container complexity detail", () => {
    const complexity = {
      role: "container" as const,
      granularity: "fine",
      leafCount: 4,
      targetLeaves: 10,
      minLeaves: 3,
      depth: 0,
    };
    const result = formatComplexityDetail(complexity);
    expect(result).toContain("Granularity: fine");
    expect(result).toContain("Role: container");
    expect(result.some((line: string) => line.includes("Leaves"))).toBe(true);
  });

  it("formats leaf complexity detail", () => {
    const complexity = {
      role: "leaf" as const,
      granularity: "micro",
      filesUsed: 3,
      filesMax: 8,
      scriptsUsed: 2,
      scriptsMax: 4,
      descriptionChars: 100,
      minDescriptionChars: 80,
      depth: 2,
    };
    const result = formatComplexityDetail(complexity);
    expect(result).toContain("Granularity: micro");
    expect(result).toContain("Role: leaf");
    expect(result.some((line: string) => line.includes("Files"))).toBe(true);
    expect(result.some((line: string) => line.includes("Scripts"))).toBe(true);
    expect(result.some((line: string) => line.includes("Description"))).toBe(true);
  });
});
