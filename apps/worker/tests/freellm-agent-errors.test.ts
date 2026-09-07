import { describe, expect, it, vi } from "vitest";
import { runFreeLlmAgent } from "../src/executor/freellm-agent.js";
import type { WorkerConfig } from "../src/config.js";
import type { JobInput } from "../src/worker-api/client.js";
import { JobCancelledError, JobPausedError } from "../src/job-runner/control.js";
import { FREELLMAPI_INITIAL_TIMEOUT_CODE, InitialResponseTimeoutError } from "../src/executor/freellm-chat.js";

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

describe("freellm-agent error handling", () => {
  it("returns error when API key is missing", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
      modelProvider: {
        baseUrl: "http://localhost:3001/v1",
        apiKey: "",
        model: "auto",
      },
    };

    const result = await runFreeLlmAgent(input, "/tmp/test", config);

    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("API key is required");
    expect(result.output.executor).toBe("freellmapi");
  });

  it("includes project context in system prompt when project is provided", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
      requiresDeliverables: false,
      project: {
        name: "Test Project",
        slug: "test-project",
      },
    };

    const create = vi.fn().mockResolvedValue({
      model: "auto",
      choices: [{
        message: {
          role: "assistant",
          content: "Task completed",
        },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, "/tmp/test", config, client as never);

    expect(result.status).toBe("succeeded");
    const firstCall = create.mock.calls[0][0];
    const systemMessage = firstCall.messages[0].content;
    expect(systemMessage).toContain("Project: Test Project (test-project)");
  });

  it("handles JobPausedError by rethrowing", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
    };

    const create = vi.fn();
    const client = { chat: { completions: { create } } };

    const control = {
      check: vi.fn().mockResolvedValue("pause"),
    };

    await expect(
      runFreeLlmAgent(input, "/tmp/test", config, client as never, undefined, control)
    ).rejects.toThrow(JobPausedError);
  });

  it("handles JobCancelledError by rethrowing", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
    };

    const create = vi.fn();
    const client = { chat: { completions: { create } } };

    const control = {
      check: vi.fn().mockResolvedValue("cancel"),
    };

    await expect(
      runFreeLlmAgent(input, "/tmp/test", config, client as never, undefined, control)
    ).rejects.toThrow(JobCancelledError);
  });

  it("handles InitialResponseTimeoutError with structured error", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
    };

    const create = vi.fn().mockRejectedValue(
      new InitialResponseTimeoutError("Timed out after 3 attempts")
    );

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, "/tmp/test", config, client as never);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(FREELLMAPI_INITIAL_TIMEOUT_CODE);
    expect(result.error?.message).toContain("Timed out after 3 attempts");
    expect(result.error?.attempts).toBe(3);
    expect(result.error?.timeoutMs).toBe(120_000);
  });

  it("handles timeout-like errors (ETIMEDOUT) with structured error", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
    };

    const timeoutError: any = new Error("Connection timed out");
    timeoutError.code = "ETIMEDOUT";

    const create = vi.fn().mockRejectedValue(timeoutError);

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, "/tmp/test", config, client as never);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(FREELLMAPI_INITIAL_TIMEOUT_CODE);
    expect(result.error?.message).toContain("Connection timed out");
  });

  it("handles generic errors with message", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
    };

    const create = vi.fn().mockRejectedValue(new Error("Network failure"));

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, "/tmp/test", config, client as never);

    expect(result.status).toBe("failed");
    expect(result.error?.message).toBe("Network failure");
    expect(result.output.executor).toBe("freellmapi");
  });

  it("handles non-Error thrown values", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
    };

    const create = vi.fn().mockRejectedValue("String error");

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, "/tmp/test", config, client as never);

    expect(result.status).toBe("failed");
    expect(result.error?.message).toBe("String error");
  });

  it("logs progress when progress reporter is provided", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
      project: {
        name: "Test Project",
        slug: "test-project",
      },
      repositoryPath: "/workspace/test",
    };

    const logs: string[] = [];
    const progress = {
      log: (line: string) => logs.push(line),
    };

    const create = vi.fn().mockResolvedValue({
      model: "auto",
      choices: [{
        message: {
          role: "assistant",
          content: "Done",
        },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const client = { chat: { completions: { create } } };
    await runFreeLlmAgent(input, "/tmp/test", config, client as never, progress);

    expect(logs).toContain("Starting code agent in web repository.");
    expect(logs.some(log => log.includes("Project: Test Project (test-project)"))).toBe(true);
    expect(logs.some(log => log.includes("Repository checkout: /workspace/test"))).toBe(true);
    expect(logs.some(log => log.includes("Prompt: Create a file"))).toBe(true);
  });
});
