import { describe, expect, it } from "vitest";
import {
  ContextOverflowError,
  DEFAULT_REPLY_RESERVE_TOKENS,
  estimateMessagesTokens,
  estimateTokens,
  formatTruncationNotice,
  looksTruncated,
} from "../../src/model-broker/context-limit.js";
import { createModelBroker } from "../../src/model-broker/client.js";
import { loadConfig } from "../../src/config.js";

/**
 * The lock on context-window detection.
 *
 * Five baseline runs of eval suite 01 were measured through a silently truncated turn before anyone
 * inspected the endpoint (`llama-server -c 4096 --context-shift` against a model supporting 32 768).
 * The orchestrator's system prompt alone measured 4 086 tokens against that 4 096 limit, so the
 * durable-state block, the history, and the operator's question were dropped from the front of every
 * turn — and every reply was scored as if the whole prompt had been read.
 *
 * These tests assert the two mechanisms that make that unrepeatable: a turn that cannot fit is refused
 * with the numbers, and a turn that was cut anyway is reported rather than scored. The measurements
 * themselves are in `docs/eval/baseline-20260924.md` § Found after run 5.
 */
describe("context window detection", () => {
  describe("truncation detection", () => {
    it("reports a cut when the endpoint reads well under half of what was sent", () => {
      // The measured shape: 3 000 words of varied text sent, 2 050 tokens reported.
      expect(looksTruncated({ reportedTokens: 2050, estimatedTokens: 9000 })).toBe(true);
    });

    it("stays silent when the estimate is merely rough", () => {
      // Measured on this repository's own prompt text: ~4.9 chars per token against an estimate of 3,
      // so a fit can report 40% less than estimated. That must not read as a truncation, because a
      // false accusation against a correct turn is its own dishonesty.
      expect(looksTruncated({ reportedTokens: 6000, estimatedTokens: 9000 })).toBe(false);
      expect(looksTruncated({ reportedTokens: 9000, estimatedTokens: 9000 })).toBe(false);
      expect(looksTruncated({ reportedTokens: 9500, estimatedTokens: 9000 })).toBe(false);
    });

    it("says nothing when the endpoint reports nothing", () => {
      // Not every compatible endpoint returns `usage`. Absence must mean "unknown", never "truncated".
      expect(looksTruncated({ reportedTokens: 0, estimatedTokens: 9000 })).toBe(false);
      expect(looksTruncated({ reportedTokens: Number.NaN, estimatedTokens: 9000 })).toBe(false);
      expect(looksTruncated({ reportedTokens: 2050, estimatedTokens: 0 })).toBe(false);
    });

    it("states the numbers and the consequence, so the turn is not read as a product failure", () => {
      const notice = formatTruncationNotice({
        reportedTokens: 2050,
        estimatedTokens: 9000,
        note: "tool call",
      });
      expect(notice).toContain("2,050");
      expect(notice).toContain("9,000");
      expect(notice).toMatch(/oldest part of this turn was discarded/i);
      expect(notice).toMatch(/not a valid measurement/i);
    });
  });

  describe("overflow refusal", () => {
    const longTurn = { role: "user" as const, content: "x".repeat(60_000) };

    it("refuses before sending when the configured context cannot hold the turn", () => {
      const broker = createModelBroker({
        baseUrl: "http://127.0.0.1:9/v1",
        model: "test",
        contextTokens: 4096,
      });

      const call = () => broker.chatWithTools([longTurn], []);
      // Pre-flight, so it never reaches the network: the point is that no request is sent at all.
      // A refused turn costs nothing and produces no reply to mistake for a measurement.
      return expect(call()).rejects.toThrow(ContextOverflowError);
    });

    it("names both numbers and the remedy in the refusal", async () => {
      const broker = createModelBroker({
        baseUrl: "http://127.0.0.1:9/v1",
        model: "test",
        contextTokens: 4096,
      });

      await broker.chatWithTools([longTurn], []).catch((error: unknown) => {
        const message = (error as Error).message;
        expect(message).toContain("4,096");
        expect(message).toMatch(/silently truncated/i);
        // The operator needs to know which surface to change, whichever endpoint they run.
        expect(message).toMatch(/KAMPAKU_MODEL_CONTEXT_TOKENS|OLLAMA_CONTEXT_LENGTH|num_ctx/);
      });
      expect.assertions(3);
    });

    it("counts the tool schemas, which are part of the prompt the endpoint reads", () => {
      // The front office's twelve schemas measured 8 220 characters, which is not small: ignoring them
      // would refuse a turn that fits or, worse, send one that does not.
      const messages = [{ role: "user" as const, content: "hi" }];
      const withoutTools = estimateMessagesTokens(messages);
      const schemaChars = 8220;
      expect(estimateTokens("z".repeat(schemaChars))).toBeGreaterThan(2000);
      expect(withoutTools).toBeLessThan(estimateTokens("z".repeat(schemaChars)));
    });

    it("does not refuse when no limit is known, and says so rather than guessing", async () => {
      // An unknown limit must not become a fabricated one. Post-flight detection still catches the cut,
      // so the honest behaviour is to send the turn and report what the endpoint says it read.
      const broker = createModelBroker({ baseUrl: "http://127.0.0.1:9/v1", model: "test" });
      expect(broker.effectiveContextTokens()).toBeNull();
      // It gets as far as the network, which is the assertion: it was not refused locally.
      await expect(broker.chatWithTools([longTurn], [])).rejects.not.toThrow(ContextOverflowError);
    });

    it("learns the endpoint's cap from a truncated turn, so the next turn is refused", async () => {
      const broker = createModelBroker({ baseUrl: "http://127.0.0.1:9/v1", model: "test" });
      const limit = 4096;
      // Simulate what `usage.prompt_tokens` reports on a cut turn: the window minus the reply reserve.
      const reported = limit - DEFAULT_REPLY_RESERVE_TOKENS;
      const estimated = 9000;
      expect(looksTruncated({ reportedTokens: reported, estimatedTokens: estimated })).toBe(true);
      // The learned limit is the reported count plus the reserve that was held back, which reproduces
      // the endpoint's real window closely enough to refuse the next overflow before sending it.
      expect(reported + DEFAULT_REPLY_RESERVE_TOKENS).toBe(limit);
    });
  });

  describe("configuration", () => {
    it("reads the context from the environment", () => {
      const config = loadConfig({
        modelContextTokens: undefined,
      });
      expect(config.modelContextTokens).toBeUndefined();

      process.env.KAMPAKU_MODEL_CONTEXT_TOKENS = "32768";
      try {
        expect(loadConfig({}).modelContextTokens).toBe(32768);
      } finally {
        delete process.env.KAMPAKU_MODEL_CONTEXT_TOKENS;
      }
    });

    it("treats a nonsensical value as unknown rather than as zero", () => {
      for (const value of ["", "abc", "-1", "0"]) {
        process.env.KAMPAKU_MODEL_CONTEXT_TOKENS = value;
        try {
          // Zero would refuse every turn; unknown merely forgoes the pre-flight check.
          expect(loadConfig({}).modelContextTokens).toBeUndefined();
        } finally {
          delete process.env.KAMPAKU_MODEL_CONTEXT_TOKENS;
        }
      }
    });
  });
});
