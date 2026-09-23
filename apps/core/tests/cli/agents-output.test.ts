import { describe, expect, it } from "vitest";
import { formatTurnMeta } from "../../src/cli/agents-output.js";

/**
 * The turn footer must always state whether tools ran.
 *
 * Measured: a turn with **zero** tool calls reported a project created, a repository linked and a
 * team of six created, none of which existed on disk. With `tools` printed only when non-empty, that
 * turn looked identical to one that had done the work. The contradiction has to be visible on the
 * same line as the claim.
 */
describe("formatTurnMeta", () => {
  it('prints "tools: none" when the turn used no tools', () => {
    const meta = formatTurnMeta({ agentUsed: "llm", model: "some-model", toolsUsed: [] });
    expect(meta).toContain("tools: none");
  });

  it("prints the tool names when tools ran", () => {
    const meta = formatTurnMeta({
      agentUsed: "llm",
      model: "some-model",
      toolsUsed: ["create_project", "list_agents"],
    });
    expect(meta).toContain("tools: create_project, list_agents");
    expect(meta).not.toContain("tools: none");
  });

  it("includes the conversation id so a one-shot turn is continuable", () => {
    const meta = formatTurnMeta({ conversationId: "abc", toolsUsed: [] });
    expect(meta).toContain("conversation: abc");
  });
});
