import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGithubTool } from "../src/executor/github.js";
import type { JobInput } from "../src/worker-api/client.js";
import type { WorkerConfig } from "../src/config.js";
import * as child_process from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("github executor", () => {
  const mockConfig: WorkerConfig = {
    coreBaseUrl: "http://localhost:8080",
    workerId: "test-worker",
    workspaceRoot: "/tmp/workspace",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("fails when GITHUB_TOKEN is missing", async () => {
    const input: JobInput = {
      id: "job-1",
      type: "github.api",
      github: { operation: "create_repo", owner: "test", name: "repo", private: false },
    };

    const result = await runGithubTool(input, mockConfig);
    
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("GITHUB_TOKEN is required");
  });

  it("fails when github payload is missing", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const input: JobInput = {
      id: "job-1",
      type: "github.api",
    };

    const result = await runGithubTool(input, mockConfig);
    
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("github payload is required");
  });

  it("creates public repository successfully", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const input: JobInput = {
      id: "job-1",
      type: "github.api",
      github: { operation: "create_repo", owner: "test", name: "repo", private: false },
    };

    const mockExecFile = vi.mocked(child_process.execFile);
    mockExecFile.mockImplementation(((_file, _args, _opts, callback) => {
      if (callback) callback(null, { stdout: "Repository created\n", stderr: "" });
      return {} as any;
    }) as any);

    const result = await runGithubTool(input, mockConfig);
    
    expect(result.status).toBe("succeeded");
    expect(result.output).toMatchObject({
      executor: "github",
      operation: "create_repo",
      repository: "test/repo",
    });
  });

  it("creates private repository successfully", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const input: JobInput = {
      id: "job-1",
      type: "github.api",
      github: { operation: "create_repo", owner: "test", name: "private-repo", private: true },
    };

    const mockExecFile = vi.mocked(child_process.execFile);
    mockExecFile.mockImplementation(((_file, _args, _opts, callback) => {
      if (callback) callback(null, { stdout: "Private repo created\n", stderr: "" });
      return {} as any;
    }) as any);

    const result = await runGithubTool(input, mockConfig);
    
    expect(result.status).toBe("succeeded");
    expect(result.output.repository).toBe("test/private-repo");
  });

  it("fails on unsupported operation", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const input: JobInput = {
      id: "job-1",
      type: "github.api",
      github: { operation: "delete_repo" as any, owner: "test", name: "repo" },
    };

    const result = await runGithubTool(input, mockConfig);
    
    expect(result.status).toBe("failed");
    expect(result.error?.message).toContain("Unsupported github operation");
  });

  it("handles gh CLI errors", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const input: JobInput = {
      id: "job-1",
      type: "github.api",
      github: { operation: "create_repo", owner: "test", name: "repo", private: false },
    };

    const mockExecFile = vi.mocked(child_process.execFile);
    mockExecFile.mockImplementation(((_file, _args, _opts, callback) => {
      if (callback) callback(new Error("gh command failed"), { stdout: "", stderr: "error" });
      return {} as any;
    }) as any);

    const result = await runGithubTool(input, mockConfig);
    
    expect(result.status).toBe("failed");
    expect(result.error?.message).toBeDefined();
  });
});
