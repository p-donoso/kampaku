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

  it("prints where the turn's time went, on every turn and not only on a stop", () => {
    // BOARD F-060. Measured 2026-09-26 taking suite 07 (run 3): a turn spent **955 s over five in-turn model
    // calls** and answered in words that named neither, while the same endpoint answered the same prompt in
    // **3.1 s** when called directly. The question "why did that take eleven minutes?" is asked about turns
    // that finished too, and before this line the only numbers anywhere were a wall clock and a call count.
    const meta = formatTurnMeta({
      agentUsed: "llm",
      model: "some-model",
      toolsUsed: ["delegate_to_agent"],
      accounting: {
        elapsedMs: 178_000,
        modelCalls: 2,
        modelLatencyMs: 20_000,
        slowestCallMs: 15_000,
        retriedCalls: 1,
        toolCalls: 1,
        toolLatencyMs: 158_000,
        nestedModelCalls: 5,
        nestedElapsedMs: 156_000,
        slowestTool: { name: "delegate_to_agent", elapsedMs: 158_000 },
      },
    });

    expect(meta).toContain("time: 178s total");
    expect(meta).toContain("2 model calls in 20s (slowest 15s)");
    expect(meta).toContain("1 retried");
    // The delegated session is the fact run 16 could not state: the turn's own counters saw one call while
    // the session it waited on made five and seventeen.
    expect(meta).toContain("delegated sessions: 5 model calls in 156s");
  });
});
