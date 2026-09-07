import { describe, expect, it } from "vitest";
import {
  computeSkillCounts,
  filterSkills,
  sortSkills,
} from "@/lib/skill-roster-utils";
import type { SkillRecord } from "@/lib/types";

const sample: SkillRecord[] = [
  {
    slug: "qa-testing",
    name: "QA Testing",
    description: "Tests",
    capabilities: ["code.agent"],
    tools: ["code-agent"],
    promptFragment: "QA",
    assignedAgentSlugs: ["qa"],
  },
  {
    slug: "docs-writer",
    name: "Docs Writer",
    description: "Docs",
    capabilities: ["code.agent"],
    tools: ["code-agent"],
    promptFragment: "Docs",
    assignedAgentSlugs: [],
  },
];

describe("skill-roster-utils", () => {
  it("computes counts", () => {
    expect(computeSkillCounts(sample)).toEqual({ total: 2, assigned: 1, unassigned: 1 });
  });

  it("filters assigned skills", () => {
    expect(filterSkills(sample, "assigned", "")).toHaveLength(1);
    expect(filterSkills(sample, "unassigned", "")).toHaveLength(1);
  });

  it("sorts by agent count descending", () => {
    const sorted = sortSkills(sample, "agents", true);
    expect(sorted[0]?.slug).toBe("qa-testing");
  });
});
