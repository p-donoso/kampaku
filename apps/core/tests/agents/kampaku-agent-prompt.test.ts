import { describe, expect, it } from "vitest";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";

describe("kampaku agent prompt", () => {
  it("includes markdown formatting guidance and question protocol rules", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("<kampaku-question>");
    expect(prompt.toLowerCase()).toMatch(/markdown|github-flavored|headings|bullet/);
    expect(prompt).toContain("English");
  });
});
