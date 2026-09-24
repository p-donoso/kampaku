import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { executeJob } from "../src/executor/session.js";
import { runModelAgent } from "../src/executor/model-agent.js";
import { InitialResponseTimeoutError } from "../src/executor/openai-compatible-chat.js";
import type { JobInput } from "../src/worker-api/client.js";

const input: JobInput = { prompt: "Implement the task", repositoryRole: "core" };
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

describe("model-backed worker", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("executes tool calls and returns the final summary", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-agent-test-"));
    const create = vi.fn()
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "write_file", arguments: JSON.stringify({ path: "result.txt", content: "done\n" }) },
          }],
        } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Implemented result.txt" } }],
        usage: { prompt_tokens: 20, completion_tokens: 7 },
      });

    const result = await runModelAgent(input, directory, config, {
      chat: { completions: { create } },
    });

    expect(await readFile(join(directory, "result.txt"), "utf8")).toBe("done\n");
    expect(result.status).toBe("succeeded");
    expect(result.output).toMatchObject({
      summary: "Implemented result.txt",
      executor: "model",
      model: "free-model",
      iterations: 2,
      usage: { inputTokens: 30, outputTokens: 12, totalTokens: 42 },
    });
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({
      model: "auto",
      tools: expect.any(Array),
      tool_choice: "auto",
    }));
  });

  it("rejects echo requests on a real worker", async () => {
    const result = await executeJob({ ...input, executor: "echo" }, "/tmp/job", config);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("EXECUTOR_NOT_ALLOWED");
  });

  it("retains echo only when explicitly started in smoke-test mode", async () => {
    const result = await executeJob(input, "/tmp/job", {
      ...config,
      executorMode: "echo",
      modelApiKey: undefined,
    });

    expect(result.status).toBe("succeeded");
    expect(result.output.executor).toBe("echo");
  });

  it("fails with MODEL_INITIAL_TIMEOUT after repeated initial timeouts", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new InitialResponseTimeoutError(1_000, 1));

    const result = await runModelAgent(
      input,
      "/tmp/job",
      {
        ...config,
        modelInitialTimeoutMs: 1_000,
        modelInitialRetries: 3,
      },
      { chat: { completions: { create } } },
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatchObject({
      code: "MODEL_INITIAL_TIMEOUT",
      attempts: 3,
      timeoutMs: 1_000,
    });
    expect(create).toHaveBeenCalledTimes(3);
  });
});
