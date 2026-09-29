import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "../src/config.js";

describe("loadWorkerConfig", () => {
  it("uses the OpenAI-compatible executor and automatic routing by default", () => {
    const config = loadWorkerConfig({}, "/workspace/apps/worker");

    expect(config.executorMode).toBe("openai-compatible");
    expect(config.agentModel).toBe("auto");
  });

  it("uses a worker-specific model without inheriting the chat model", () => {
    const config = loadWorkerConfig({
      KAMPAKU_AGENT_MODEL: "auto",
      KAMPAKU_WORKER_MODEL: "gpt-5.6-sol",
    });

    expect(config.agentModel).toBe("gpt-5.6-sol");
  });

  it("rejects unknown executor modes", () => {
    expect(() => loadWorkerConfig({ KAMPAKU_EXECUTOR: "noop" })).toThrow(
      'Invalid KAMPAKU_EXECUTOR: noop. Expected "openai-compatible" or "echo".',
    );
  });

  /**
   * The worker is where the software is actually written, so its calls take the execution budget rather
   * than the planning one. Measured 2026-09-28: the same endpoint at its default reasoning effort emitted
   * 8 000–18 000 output tokens per call, and this loop makes one call per iteration. See
   * `docs/concepts/token-economy.md`.
   */
  it("asks for a low reasoning budget by default, since it carries a plan out rather than making one", () => {
    expect(loadWorkerConfig({}, "/workspace/apps/worker").reasoningEffort).toBe("low");
  });

  it("reads the budget from the same setting Core uses for its working calls", () => {
    expect(loadWorkerConfig({ KAMPAKU_AGENT_REASONING_EFFORT: "medium" }).reasoningEffort).toBe(
      "medium",
    );
    expect(loadWorkerConfig({ KAMPAKU_PLANNER_REASONING_EFFORT: "high" }).reasoningEffort).toBe("low");
  });

  it("sends no budget at all when it is switched off, and treats a blank value as unset", () => {
    for (const off of ["off", "none", "false", "0", "OFF"]) {
      expect(loadWorkerConfig({ KAMPAKU_AGENT_REASONING_EFFORT: off }).reasoningEffort).toBeUndefined();
    }
    expect(loadWorkerConfig({ KAMPAKU_AGENT_REASONING_EFFORT: "  " }).reasoningEffort).toBe("low");
  });

  it("passes through a word no endpoint is known to know", () => {
    // The request is where a vocabulary mismatch is decided; a value swallowed here would be a setting that
    // appears to do nothing.
    expect(loadWorkerConfig({ KAMPAKU_AGENT_REASONING_EFFORT: "maximal" }).reasoningEffort).toBe(
      "maximal",
    );
  });
});
