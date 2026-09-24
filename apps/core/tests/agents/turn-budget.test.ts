import { describe, expect, it } from "vitest";
import {
  boundToolResult,
  CLEARABLE_TOOLS,
  clearStaleToolResults,
  clearedResultNotice,
  duplicateCallNotice,
  MAX_TOOL_RESULT_CHARS,
  MIN_TOKENS_TO_CLEAR,
  TOOL_RESULT_PREVIEW_CHARS,
  TOOL_RESULTS_KEPT_VERBATIM,
  TurnToolCalls,
} from "../../src/agents/runtime/turn-budget.js";
import { KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";

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

  describe("clearing stale results", () => {
    /** A loop that made `count` read calls, each with a sizeable result, in the real message shape. */
    function loopOf(count: number, toolName = "list_agents", size = 3_000) {
      const messages: Array<{
        role: string;
        content: string;
        tool_call_id?: string;
        tool_calls?: unknown;
      }> = [{ role: "system", content: "identity" }];
      for (let index = 0; index < count; index += 1) {
        const id = `call-${index}`;
        messages.push({
          role: "assistant",
          content: "",
          tool_calls: [{ id, function: { name: toolName, arguments: "{}" } }],
        });
        messages.push({ role: "tool", content: "x".repeat(size), tool_call_id: id });
      }
      return messages;
    }

    it("keeps the most recent results verbatim", () => {
      const messages = loopOf(TOOL_RESULTS_KEPT_VERBATIM + 3);
      clearStaleToolResults(messages);

      const results = messages.filter((message) => message.role === "tool");
      const kept = results.slice(-TOOL_RESULTS_KEPT_VERBATIM);
      const cleared = results.slice(0, -TOOL_RESULTS_KEPT_VERBATIM);

      // Recent results are what the decision in front of the model depends on.
      for (const message of kept) {
        expect(message.content).toBe("x".repeat(3_000));
      }
      for (const message of cleared) {
        expect(message.content).toContain('"cleared":true');
      }
    });

    it("keeps the call record, so the model knows the call happened", () => {
      const messages = loopOf(TOOL_RESULTS_KEPT_VERBATIM + 1);
      clearStaleToolResults(messages);

      const first = messages.find((message) => message.role === "tool");
      // The `tool_call_id` pairing must survive, or the transcript becomes malformed for the next call.
      expect(first?.tool_call_id).toBe("call-0");
      const parsed = JSON.parse(first!.content) as { cleared?: boolean; note?: string };
      expect(parsed.cleared).toBe(true);
      expect(parsed.note).toContain("list_agents");
      // And it has to say the call succeeded, or the model may repeat it to "find out what happened".
      expect(parsed.note).toMatch(/call was made and succeeded/i);
    });

    it("never clears a result that cannot be re-obtained", () => {
      // The whole safety of this rests on the allowlist. `create_project` returns the id of the container
      // it just made; calling it again fails with "already exists", so its result is data, not a cache.
      const messages = loopOf(TOOL_RESULTS_KEPT_VERBATIM + 2, "create_project");
      const result = clearStaleToolResults(messages);

      expect(result.cleared).toBe(0);
      for (const message of messages.filter((m) => m.role === "tool")) {
        expect(message.content).toBe("x".repeat(3_000));
      }
    });

    it("clears only tools that are registered, so the allowlist cannot rot into fiction", () => {
      const registered = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
      const unknown = [...CLEARABLE_TOOLS].filter((name) => !registered.has(name));

      expect(unknown).toEqual([]);
      // And the unambiguous mutations are absent, named, so a future edit has to argue with this test.
      for (const name of [
        "create_project",
        "create_sub_agent",
        "triage_intent",
        "submit_intent",
        "delegate_to_agent",
        "assign_skill",
        "remember_log",
        "propose_wiki_edit",
      ]) {
        expect(CLEARABLE_TOOLS.has(name)).toBe(false);
      }
    });

    it("leaves an unidentifiable result alone", () => {
      // Without the tool name there is no way to know whether the payload can be fetched again.
      const messages: Array<{ role: string; content: string; tool_call_id?: string }> = [
        { role: "tool", content: "x".repeat(9_000), tool_call_id: "orphan" },
      ];
      for (let index = 0; index < TOOL_RESULTS_KEPT_VERBATIM; index += 1) {
        messages.push({ role: "tool", content: "tail", tool_call_id: `tail-${index}` });
      }

      const result = clearStaleToolResults(messages);

      expect(result.cleared).toBe(0);
      expect(messages[0].content).toBe("x".repeat(9_000));
    });

    it("does nothing when the saving is too small to justify the rewrite", () => {
      // Rewriting the message array invalidates the serving-side prefix cache from the first changed
      // byte, so a clearing that frees almost nothing costs more than it saves.
      const messages = loopOf(TOOL_RESULTS_KEPT_VERBATIM + 2, "get_project", 40);
      const result = clearStaleToolResults(messages);

      expect(result.tokensSaved).toBeLessThan(MIN_TOKENS_TO_CLEAR);
      expect(result.cleared).toBe(0);
    });

    it("reports what it freed, because an invisible context decision cannot be tuned", () => {
      const messages = loopOf(TOOL_RESULTS_KEPT_VERBATIM + 4);
      const result = clearStaleToolResults(messages);

      expect(result.cleared).toBe(4);
      expect(result.tokensSaved).toBeGreaterThan(MIN_TOKENS_TO_CLEAR);
      // The placeholder is small enough that the saving is real, not cosmetic.
      expect(clearedResultNotice("list_agents").length).toBeLessThan(500);
    });

    it("is idempotent, so a second pass does not clear what the first already did", () => {
      const messages = loopOf(TOOL_RESULTS_KEPT_VERBATIM + 2);
      const first = clearStaleToolResults(messages);
      const second = clearStaleToolResults(messages);

      expect(first.cleared).toBeGreaterThan(0);
      expect(second.cleared).toBe(0);
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
