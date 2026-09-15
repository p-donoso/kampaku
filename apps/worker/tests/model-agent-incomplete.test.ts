import { describe, expect, it } from "vitest";
import { runModelAgent } from "../src/executor/model-agent.js";
import { WORKER_INCOMPLETE_MUTATIONS_CODE } from "../src/tools/mutation-outcome.js";
import type { WorkerConfig } from "../src/config.js";
import type { JobInput } from "../src/worker-api/client.js";

const config: WorkerConfig = {
  coreUrl: "http://127.0.0.1:8080",
  workerId: "worker-id",
  workerName: "test-worker",
  workspaceRoot: "/workspace",
  executorMode: "freellmapi",
  freellmapiBaseUrl: "http://localhost:3001/v1",
  freellmapiApiKey: "test-key",
  agentModel: "auto",
  pollIntervalMs: 2_000,
  freellmapiInitialTimeoutMs: 120_000,
  freellmapiInitialRetries: 3,
};

describe("model-agent incomplete mutations", () => {
  it("fails the job when every write attempt fails but the model stops", async () => {
    const input: JobInput = {
      prompt: "Create CI workflow",
      repositoryRole: "web",
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
                      name: "write_file",
                      arguments: JSON.stringify({
                        path: "../outside-repo/ci.yml",
                        content: "name: CI\n",
                      }),
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
        choices: [{ message: { role: "assistant", content: "Could not create the workflow." } }],
        usage: { prompt_tokens: 20, completion_tokens: 7 },
      };
    };

    const result = await runModelAgent(input, "/tmp/kampaku-incomplete-root", config, {
      chat: { completions: { create } },
    });

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(WORKER_INCOMPLETE_MUTATIONS_CODE);
  });
});
