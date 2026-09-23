import { describe, expect, it } from "vitest";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";

describe("kampaku agent prompt", () => {
  it("includes markdown formatting guidance and question protocol rules", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("<kampaku-question>");
    expect(prompt.toLowerCase()).toMatch(/markdown|github-flavored|headings|bullet/);
    expect(prompt).toContain("English");
  });

  /**
   * An agent asked to create a project tried `update_project`, got "Project not found", and told the
   * emperor that projects are "typically created by submit_intent with create_missing_agents: true" —
   * a mechanism that does not exist. The tool existed; the guidance never mentioned it, and the
   * failure was explained away rather than corrected.
   */
  it("names create_project and states that a project is never created implicitly", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    expect(prompt).toContain("create_project");
    expect(prompt).toContain("never created implicitly");
    expect(prompt).toContain("do not infer a different creation path");
  });
});
