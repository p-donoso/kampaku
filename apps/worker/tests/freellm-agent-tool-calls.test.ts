import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runFreeLlmAgent } from "../src/executor/freellm-agent.js";
import type { WorkerConfig } from "../src/config.js";
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

describe("freellm-agent tool call scenarios", () => {
  let sandboxPath: string;

  beforeEach(async () => {
    sandboxPath = await mkdtemp(join(tmpdir(), "freellm-tool-"));
    await writeFile(
      join(sandboxPath, "package.json"),
      JSON.stringify({ name: "test", scripts: { test: "echo ok" } })
    );
  });

  afterEach(async () => {
    await rm(sandboxPath, { recursive: true, force: true });
  });

  it("handles tool calls without run_check (write_file only)", async () => {
    const input: JobInput = {
      prompt: "Create a file",
      repositoryRole: "web",
      requiresDeliverables: true,
    };

    const writeCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "test.txt", content: "hello" }),
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
            content: "Created the file",
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, sandboxPath, config, client as never);

    expect(result.status).toBe("succeeded");
    expect(result.output.iterations).toBeGreaterThan(0);
  });

  it("handles run_check with non-string script argument", async () => {
    const input: JobInput = {
      prompt: "Run checks",
      repositoryRole: "web",
      requiresDeliverables: false,
    };

    const badCheckCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "run_check",
        arguments: JSON.stringify({ script: 123 }),
      },
    };

    const create = vi.fn()
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [badCheckCall],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: "Task done",
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, sandboxPath, config, client as never);

    expect(result.status).toBe("succeeded");
  });

  it("logs tool arguments with very long values", async () => {
    const input: JobInput = {
      prompt: "Create a file with long content",
      repositoryRole: "web",
      requiresDeliverables: true,
    };

    const longContent = "a".repeat(200);
    const writeCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "long.txt", content: longContent }),
      },
    };

    const logs: string[] = [];
    const progress = {
      log: (line: string) => logs.push(line),
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
            content: "Created",
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });

    const client = { chat: { completions: { create } } };
    await runFreeLlmAgent(input, sandboxPath, config, client as never, progress);

    const toolLog = logs.find(l => l.includes("write_file("));
    expect(toolLog).toBeDefined();
    expect(toolLog).toContain("…");
  });

  it("logs tool result with very long output", async () => {
    const input: JobInput = {
      prompt: "Read a file",
      repositoryRole: "web",
      requiresDeliverables: false,
    };

    const longText = "line\n".repeat(50);
    await writeFile(join(sandboxPath, "long.txt"), longText);

    const readCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "long.txt" }),
      },
    };

    const logs: string[] = [];
    const progress = {
      log: (line: string) => logs.push(line),
    };

    const create = vi.fn()
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [readCall],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: "Read the file",
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });

    const client = { chat: { completions: { create } } };
    await runFreeLlmAgent(input, sandboxPath, config, client as never, progress);

    const resultLog = logs.find(l => l.includes("read_file →"));
    expect(resultLog).toBeDefined();
  });

  it("handles tool arguments with non-string values", async () => {
    const input: JobInput = {
      prompt: "Do something",
      repositoryRole: "web",
      requiresDeliverables: false,
    };

    const toolCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "read_file",
        arguments: JSON.stringify({
          path: "test.txt",
          options: { encoding: "utf8", flag: 123 },
        }),
      },
    };

    await writeFile(join(sandboxPath, "test.txt"), "content");

    const create = vi.fn()
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [toolCall],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: "Done",
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, sandboxPath, config, client as never);

    expect(result.status).toBe("succeeded");
  });

  it("handles tool calls with empty arguments", async () => {
    const input: JobInput = {
      prompt: "List files",
      repositoryRole: "web",
      requiresDeliverables: false,
    };

    const listCall = {
      id: "call-1",
      type: "function" as const,
      function: {
        name: "list_files",
        arguments: "",
      },
    };

    const create = vi.fn()
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [listCall],
          },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "auto",
        choices: [{
          message: {
            role: "assistant",
            content: "Listed",
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });

    const client = { chat: { completions: { create } } };
    const result = await runFreeLlmAgent(input, sandboxPath, config, client as never);

    expect(result.status).toBe("succeeded");
  });
});
