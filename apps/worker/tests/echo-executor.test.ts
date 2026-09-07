import { describe, it, expect } from "vitest";
import { runEchoExecutor } from "../src/executor/echo.js";
import type { JobInput } from "../src/worker-api/client.js";

describe("echo executor", () => {
  it("returns success with summary of prompt and path", async () => {
    const input: JobInput = {
      id: "job-1",
      type: "echo",
      prompt: "Test task description",
      repositoryRole: "agents",
    };

    const result = await runEchoExecutor(input, "/tmp/sandbox");
    
    expect(result.status).toBe("succeeded");
    expect(result.output.executor).toBe("echo");
    expect(result.output.summary).toContain("Test task description");
    expect(result.output.summary).toContain("/tmp/sandbox");
  });

  it("includes repository role in output", async () => {
    const input: JobInput = {
      id: "job-2",
      type: "echo",
      prompt: "Another test",
      repositoryRole: "knowledge",
    };

    const result = await runEchoExecutor(input, "/workspace");
    
    expect(result.output.repositoryRole).toBe("knowledge");
  });

  it("handles different sandbox paths", async () => {
    const input: JobInput = {
      id: "job-3",
      type: "echo",
      prompt: "Path test",
      repositoryRole: "planning",
    };

    const result = await runEchoExecutor(input, "/custom/sandbox/path");
    
    expect(result.output.summary).toContain("/custom/sandbox/path");
  });
});
