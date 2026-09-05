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

describe("freellm-agent iteration limit", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("succeeds at iteration limit when deliverables were written", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-iter-limit-"));
    const input: JobInput = {
      prompt: "Create service file",
      repositoryRole: "web",
      repositoryPath: directory,
      requiresDeliverables: true,
    };

    const toolCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "service/main.py", content: "print('ok')\n" }),
      },
    };

    const create = vi.fn().mockImplementation(async () => ({
      model: "auto",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [toolCall],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, directory, config, client as never);

    expect(result.status).toBe("succeeded");
    expect(result.output.iterationLimitReached).toBe(true);
    expect(await readFile(join(directory, "service/main.py"), "utf8")).toContain("ok");
    expect(create.mock.calls.length).toBe(30);
  });
});
