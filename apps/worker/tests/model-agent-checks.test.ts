import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runModelAgent } from "../src/executor/model-agent.js";
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

describe("model-agent required checks", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("fails stall exit when npm run build is required but not run", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-checks-"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name: "demo", scripts: { build: "node -e \"process.exit(0)\"" } }),
      "utf8",
    );

    const input: JobInput = {
      prompt: "Fix repo.\n\nAcceptance criteria:\n\n- npm run build must pass.",
      repositoryRole: "web",
      repositoryPath: directory,
      requiresDeliverables: true,
    };

    const writeCall = {
      id: "call-write",
      type: "function" as const,
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "README.md", content: "ok\n" }),
      },
    };
    const readCall = {
      id: "call-read",
      type: "function" as const,
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "README.md" }),
      },
    };

    const create = vi.fn().mockImplementation(async () => ({
      model: "auto",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [writeCall],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));

    let iteration = 0;
    (create as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      iteration += 1;
      if (iteration === 1) {
        return {
          model: "auto",
          choices: [{ message: { role: "assistant", content: null, tool_calls: [writeCall] } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        };
      }
      return {
        model: "auto",
        choices: [{ message: { role: "assistant", content: null, tool_calls: [readCall] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      };
    });

    const client = { chat: { completions: { create } } };
    const result = await runModelAgent(input, directory, config, client as never);

    expect(result.status).toBe("succeeded");
    expect((result.output as { checkResults?: Record<string, boolean> }).checkResults?.build).toBe(true);
    // Explicit, because this test runs a package script through a real process: the bound is the work's, not vitest's
    // 5 000 ms default, which measured red on a loaded host and green in isolation (BOARD F-020).
  }, 60_000);
});
