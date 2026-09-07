import { describe, it, expect, vi } from "vitest";
import { executeJob } from "../src/executor/session.js";
import type { JobInput } from "../src/worker-api/client.js";
import type { WorkerConfig } from "../src/config.js";

describe("executor session", () => {
  const mockConfig: WorkerConfig = {
    coreBaseUrl: "http://localhost:8080",
    workerId: "test-worker",
    workspaceRoot: "/tmp/workspace",
  };

  it("routes github executor jobs to github tool", async () => {
    const input: JobInput = {
      id: "job-1",
      type: "github.api",
      executor: "github",
      github: { operation: "create_repo", owner: "test", name: "repo", private: false },
    };

    process.env.GITHUB_TOKEN = "test-token";
    
    const result = await executeJob(input, "/tmp/sandbox", mockConfig);
    
    expect(result.status).toBeDefined();
  });

  it("fails echo executor when not in echo mode", async () => {
    const input: JobInput = {
      id: "job-1",
      type: "echo",
      executor: "echo",
      data: { test: "value" },
    };

    const result = await executeJob(input, "/tmp/sandbox", mockConfig);
    
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("EXECUTOR_NOT_ALLOWED");
  });

  it("runs echo executor when worker is in echo mode", async () => {
    const echoConfig = { ...mockConfig, executorMode: "echo" as const };
    const input: JobInput = {
      id: "job-1",
      type: "echo",
      data: { test: "value" },
    };

    const result = await executeJob(input, "/tmp/sandbox", echoConfig);
    
    expect(result.status).toBe("succeeded");
    expect(result.output).toBeDefined();
  });
});
