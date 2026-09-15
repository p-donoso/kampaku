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
});
