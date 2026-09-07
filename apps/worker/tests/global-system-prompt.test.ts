import { describe, expect, it } from "vitest";
import { runFreeLlmAgent } from "../src/executor/freellm-agent.js";
import type { WorkerConfig } from "../src/config.js";

describe("global system prompt", () => {
  it("places the configured text first in the worker system message", async () => {
    let request: Record<string, any> | undefined;
    const config: WorkerConfig = {
      coreUrl: "http://test",
      workerId: "worker-id",
      workerName: "worker",
      workspaceRoot: "/workspace",
      executorMode: "freellmapi",
      freellmapiBaseUrl: "http://test/v1",
      freellmapiApiKey: "key",
      agentModel: "auto",
      pollIntervalMs: 2_000,
      freellmapiInitialTimeoutMs: 120_000,
      freellmapiInitialRetries: 1,
    };

    await runFreeLlmAgent(
      { globalSystemPrompt: "FIRST IMPERIAL INSTRUCTION", prompt: "Inspect the project", repositoryRole: "core" },
      "/tmp/kampaku-global-prompt-test",
      config,
      { chat: { completions: { create: async (value) => {
        request = value;
        return { choices: [{ message: { role: "assistant", content: "Done" } }] };
      } } } },
    );

    expect(request?.messages[0].role).toBe("system");
    expect(request?.messages[0].content.startsWith("FIRST IMPERIAL INSTRUCTION")).toBe(true);
  });
});
