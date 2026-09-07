import { describe, expect, it, vi } from "vitest";
import { executeJob } from "../src/executor/session.js";
import type { JobInput } from "../src/worker-api/client.js";
import type { WorkerConfig } from "../src/config.js";

const baseConfig: WorkerConfig = {
  coreUrl: "http://127.0.0.1:8080",
  workerId: "test-worker",
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

describe("executeJob executor routing", () => {
  it("routes to github executor when input.executor is github", async () => {
    const input: JobInput = {
      prompt: "Test GitHub tool",
      repositoryRole: "web",
      executor: "github",
      tool: "list_prs",
      toolArgs: { repo: "test/repo" },
    };

    const logs: string[] = [];
    const execution = {
      progress: {
        log: (line: string) => logs.push(line),
      },
    };

    const result = await executeJob(input, "/tmp/sandbox", baseConfig, execution);

    expect(logs).toContain("Running GitHub executor.");
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("GITHUB_TOKEN is required");
  });

  it("routes to echo executor when config.executorMode is echo", async () => {
    const input: JobInput = {
      prompt: "Test echo",
      repositoryRole: "web",
    };

    const echoConfig = { ...baseConfig, executorMode: "echo" as const };
    const logs: string[] = [];
    const execution = {
      progress: {
        log: (line: string) => logs.push(line),
      },
    };

    const result = await executeJob(input, "/tmp/sandbox", echoConfig, execution);

    expect(logs).toContain("Running echo executor.");
    expect(result.output.executor).toBe("echo");
  });

  it("returns error when echo executor requested but worker not in echo mode", async () => {
    const input: JobInput = {
      prompt: "Test echo",
      repositoryRole: "web",
      executor: "echo",
    };

    const result = await executeJob(input, "/tmp/sandbox", baseConfig);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("EXECUTOR_NOT_ALLOWED");
    expect(result.error?.message).toContain("Echo jobs are only allowed");
  });

  it("defaults to freellm agent when no special executor requested", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
      modelProvider: {
        baseUrl: "http://localhost:3001/v1",
        apiKey: "",
        model: "auto",
      },
    };

    const result = await executeJob(input, "/tmp/sandbox", baseConfig);

    expect(result.error?.message).toContain("API key is required");
  });

  it("works without execution context provided", async () => {
    const input: JobInput = {
      prompt: "Test",
      repositoryRole: "web",
      executor: "echo",
    };

    const result = await executeJob(input, "/tmp/sandbox", baseConfig);

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("EXECUTOR_NOT_ALLOWED");
  });
});
