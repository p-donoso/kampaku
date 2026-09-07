import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runFreeLlmAgent } from "../src/executor/freellm-agent.js";
import type { WorkerConfig } from "../src/config.js";
import type { JobInput } from "../src/worker-api/client.js";
import { WORKER_CHECKS_INCOMPLETE_CODE } from "../src/tools/worker-verification.js";

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

describe("freellm-agent check failure scenarios", () => {
  let sandboxPath: string;

  beforeEach(async () => {
    sandboxPath = await mkdtemp(join(tmpdir(), "freellm-check-fail-"));
    await writeFile(
      join(sandboxPath, "package.json"),
      JSON.stringify({
        name: "test",
        scripts: {
          test: "exit 1",
          build: "exit 0",
        },
      })
    );
  });

  afterEach(async () => {
    await rm(sandboxPath, { recursive: true, force: true });
  });

  it("fails when required check script fails", async () => {
    const input: JobInput = {
      prompt: "Fix the bug",
      repositoryRole: "web",
      requiresDeliverables: true,
      requiredChecks: ["test", "build"],
    };

    const writeCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "fix.txt", content: "fixed" }),
      },
    };

    const checkCallTest = {
      id: "call-2",
      type: "function" as const,
      function: {
        name: "run_check",
        arguments: JSON.stringify({ script: "test" }),
      },
    };

    const create = vi.fn()
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [writeCall],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [checkCallTest],
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      })
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: "Fixed the bug",
          },
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      });

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, sandboxPath, config, client as never);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(WORKER_CHECKS_INCOMPLETE_CODE);
    expect(result.error?.message).toContain("Required checks failed");
  });

  it("auto-runs missing checks when agent finishes without running them", async () => {
    const input: JobInput = {
      prompt: "Add feature",
      repositoryRole: "web",
      requiresDeliverables: true,
      requiredChecks: ["build"],
    };

    await writeFile(
      join(sandboxPath, "package.json"),
      JSON.stringify({
        name: "test",
        scripts: {
          build: "echo 'build success'",
        },
      })
    );

    const writeCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "feature.txt", content: "new feature" }),
      },
    };

    const create = vi.fn()
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [writeCall],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: "Feature added",
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, sandboxPath, config, client as never);

    expect(result.status).toBe("succeeded");
    const checkResults = (result.output as any).checkResults;
    expect(checkResults.build).toBe(true);
  });
});
