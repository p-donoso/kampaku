import { describe, expect, it } from "vitest";
import { runModelAgent } from "../src/executor/model-agent.js";
import { WORKER_NO_DELIVERABLES_CODE } from "../src/tools/mutation-outcome.js";
import type { WorkerConfig } from "../src/config.js";
import type { JobInput } from "../src/worker-api/client.js";

const config: WorkerConfig = {
  coreUrl: "http://127.0.0.1:8080",
  workerId: "worker-id",
  workerName: "test-worker",
  workspaceRoot: "/workspace",
  executorMode: "endpoint",
  modelBaseUrl: "http://localhost:3001/v1",
  modelApiKey: "test-key",
  agentModel: "auto",
  pollIntervalMs: 2_000,
  modelInitialTimeoutMs: 120_000,
  modelInitialRetries: 3,
};

describe("model-agent missing deliverables", () => {
  it("fails when the model stops after read-only exploration", async () => {
    const input: JobInput = {
      prompt: "Document the API in docs/api-reference.md",
      repositoryRole: "web",
      requiresDeliverables: true,
    };
    let call = 0;
    const create = async () => {
      call += 1;
      if (call === 1) {
        return {
          model: "free-model",
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "package.json" }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        };
      }
      return {
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Documentation plan complete." } }],
        usage: { prompt_tokens: 20, completion_tokens: 7 },
      };
    };

    const result = await runModelAgent(input, "/tmp/kampaku-readonly-root", config, {
      chat: { completions: { create } },
    });

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(WORKER_NO_DELIVERABLES_CODE);
  });
});
