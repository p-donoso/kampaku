import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runFreeLlmAgent } from "../src/tools/freellm-agent.js";
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

describe("freellm-agent write_file", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("creates nested directories when writing a new file", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-write-"));
    const input: JobInput = {
      prompt: "Create CI workflow",
      repositoryRole: "web",
      repositoryPath: directory,
    };
    const create = vi
      .fn()
      .mockResolvedValueOnce({
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
                      path: ".github/workflows/ci.yml",
                      content: "name: CI\n",
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Created workflow." } }],
        usage: { prompt_tokens: 20, output_tokens: 7 },
      });

    const result = await runFreeLlmAgent(input, directory, config, {
      chat: { completions: { create } },
    });

    expect(result.status).toBe("succeeded");
    expect(await readFile(join(directory, ".github/workflows/ci.yml"), "utf8")).toBe("name: CI\n");
  });
});
