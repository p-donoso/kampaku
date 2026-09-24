import { describe, expect, it } from "vitest";
import {
  boundToolResult,
  duplicateCallNotice,
  MAX_TOOL_RESULT_CHARS,
  TOOL_RESULT_PREVIEW_CHARS,
  TurnToolCalls,
} from "../../src/agents/runtime/turn-budget.js";

/**
 * The lock on a turn not inflating itself.
 *
 * Measured on the conversation suite 01's refused turn left behind: 15 322 characters of tool results,
 * of which **12 300 — 80% — were either the whole skill catalog or a byte-identical duplicate**:
 *
 * ```text
 *  9575 tool  list_skills          <- one result, 62% of tool weight
 *  2725 tool  list_agents
 *  2725 tool  list_agents          <- identical to the one above
 * ```
 *
 * Four runs of prompt tuning had been aimed at the system prompt, which is the second-largest item in
 * the turn. The largest was this.
 */
describe("turn tool budget", () => {
  describe("repeat calls", () => {
    it("recognises a call that already happened this turn", () => {
      const calls = new TurnToolCalls();
      const args = JSON.stringify({ agent_slug: "kampaku" });

      expect(calls.isRepeat("list_agents", args)).toBe(false);
      // The measured duplication: same tool, same arguments, second result identical to the first.
      expect(calls.isRepeat("list_agents", args)).toBe(true);
    });

    it("treats a different argument as a different call", () => {
      const calls = new TurnToolCalls();

      expect(calls.isRepeat("get_agent_dashboard", JSON.stringify({ agent_slug: "a" }))).toBe(false);
      expect(calls.isRepeat("get_agent_dashboard", JSON.stringify({ agent_slug: "b" }))).toBe(false);
      expect(calls.size).toBe(2);
    });

    it("treats a different tool with the same arguments as a different call", () => {
      const calls = new TurnToolCalls();
      const args = JSON.stringify({ slug: "x" });

      expect(calls.isRepeat("get_project", args)).toBe(false);
      expect(calls.isRepeat("get_skill", args)).toBe(false);
    });

    it("scopes repeats to one turn, so a later turn is not starved of a read it needs", () => {
      // A projection that leaked across turns would withhold a result from a question that never saw it.
      const first = new TurnToolCalls();
      const args = JSON.stringify({});
      first.isRepeat("list_agents", args);

      const second = new TurnToolCalls();
      expect(second.isRepeat("list_agents", args)).toBe(false);
    });

    it("answers a repeat with the fact of the repeat and no content", () => {
      const notice = duplicateCallNotice("list_agents");
      const parsed = JSON.parse(notice) as { duplicate?: boolean; note?: string; output?: unknown };

      expect(parsed.duplicate).toBe(true);
      // No `output`: repeating it is the cost this exists to avoid.
      expect(parsed.output).toBeUndefined();
      expect(parsed.note).toContain("list_agents");
      expect(parsed.note).toMatch(/already called/i);
      // And it has to stop the model waiting for a different answer.
      expect(parsed.note).toMatch(/nothing was executed a second time/i);
    });
  });

  describe("the safety net", () => {
    it("passes a result that fits through unchanged", () => {
      const small = JSON.stringify({ ok: true, output: { count: 0 } });
      expect(boundToolResult(small)).toBe(small);
    });

    it("bounds a large result and says what was omitted", () => {
      const large = JSON.stringify({ ok: true, output: { blob: "x".repeat(20_000) } });
      const bounded = boundToolResult(large);
      const parsed = JSON.parse(bounded) as {
        output_truncated?: boolean;
        chars?: number;
        shown?: number;
        preview?: string;
        note?: string;
      };

      expect(bounded.length).toBeLessThan(large.length);
      expect(parsed.output_truncated).toBe(true);
      expect(parsed.chars).toBe(large.length);
      expect(parsed.shown).toBe(TOOL_RESULT_PREVIEW_CHARS);
      expect(parsed.preview).toHaveLength(TOOL_RESULT_PREVIEW_CHARS);
      // Silence here would be the same defect as the endpoint truncating a prompt and reporting
      // nothing: a model handed a cut result without being told treats it as complete.
      expect(parsed.note).toMatch(/larger than the/i);
      expect(parsed.note).toMatch(/rest is omitted/i);
    });

    it("stays parseable, so nothing downstream breaks on a bounded result", () => {
      const large = JSON.stringify({ ok: true, output: { blob: "y".repeat(30_000) } });
      expect(() => JSON.parse(boundToolResult(large))).not.toThrow();
    });

    it("bounds at the threshold, not below it", () => {
      const exactly = "z".repeat(MAX_TOOL_RESULT_CHARS);
      expect(boundToolResult(exactly)).toBe(exactly);
      const over = "z".repeat(MAX_TOOL_RESULT_CHARS + 1);
      expect(boundToolResult(over)).not.toBe(over);
    });
  });
});
