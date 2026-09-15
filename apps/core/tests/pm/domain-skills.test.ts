import { describe, expect, it } from "vitest";
import { composeDomainSkills, validateDomainSkill } from "../../src/application/pm/domain-skills.js";

describe("domain skills", () => {
  it("requires bounded responsibilities and evidence guidance", () => {
    expect(validateDomainSkill({ name: "Research", responsibilities: ["source review"], checks: ["citation check"], evidenceGuidance: ["source URLs"], domains: ["illustrative"] }).ok).toBe(true);
  });

  it("detects overlapping responsibilities during composition", () => {
    const result = composeDomainSkills([{ name: "A", responsibilities: ["review"], checks: [], evidenceGuidance: [], domains: ["x"] }, { name: "B", responsibilities: ["review"], checks: [], evidenceGuidance: [], domains: ["y"] }]);
    expect(result.ok).toBe(false);
  });
});
