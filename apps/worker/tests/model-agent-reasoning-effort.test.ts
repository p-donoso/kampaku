import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runModelAgent } from "../src/executor/model-agent.js";
import type { JobInput } from "../src/worker-api/client.js";

/**
 * The worker is where the software is written, so it is the last place that should be paying for
 * deliberation.
 *
 * Measured 2026-09-28: the endpoint that serves `auto:escalera` defaults to reasoning effort `high`, which
 * emitted **8 000–18 000 output tokens per call** — and this loop makes one call per iteration, at 30
 * iterations, while re-sending a transcript that grows each time. The worker's own `usage` counters show the
 * cost after the fact; this asserts the request that decides it.
 */

function config(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    coreUrl: "http://127.0.0.1:8080",
    workerId: "worker-id",
    workerName: "test-worker",
    workspaceRoot: "/workspace",
    executorMode: "openai-compatible",
    modelBaseUrl: "http://localhost:3001/v1",
    modelApiKey: "test-key",
    agentModel: "auto",
    pollIntervalMs: 2_000,
    modelInitialTimeoutMs: 120_000,
    modelInitialRetries: 3,
    ...overrides,
  };
}

/** A client that answers once and stops, so one request is made and it can be inspected. */
function oneShotClient() {
  const create = vi.fn().mockResolvedValue({
    model: "auto",
    choices: [{ message: { role: "assistant", content: "Nothing to do.", tool_calls: undefined } }],
    usage: { prompt_tokens: 10, completion_tokens: 10 },
  });
  return { create, client: { chat: { completions: { create } } } };
}

describe("the worker's reasoning budget", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  async function run(workerConfig: WorkerConfig) {
    directory = await mkdtemp(join(tmpdir(), "kampaku-worker-effort-"));
    const input: JobInput = {
      prompt: "Create service file",
      repositoryRole: "web",
      repositoryPath: directory,
      requiresDeliverables: true,
    };
    const { create, client } = oneShotClient();
    await runModelAgent(input, directory, workerConfig, client as never);
    return create;
  }

  it("asks the endpoint for a low budget when one is configured", async () => {
    const create = await run(config({ reasoningEffort: "low" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.reasoning_effort).toBe("low");
  });

  it("sends no budget field at all when none is configured", async () => {
    // Absence rather than `undefined`: an endpoint that rejects the parameter must be able to receive a
    // request that does not mention it.
    const create = await run(config());

    expect(Object.keys(create.mock.calls[0]?.[0] ?? {})).not.toContain("reasoning_effort");
  });

  it("keeps the rest of the request unchanged", async () => {
    // The budget is an addition, not a replacement: the tool loop still offers its coding tools and still
    // lets the endpoint choose, which is what makes the worker a coding agent rather than a chat call.
    const create = await run(config({ reasoningEffort: "low" }));
    const request = create.mock.calls[0]?.[0] ?? {};

    expect(request.model).toBe("auto");
    expect(request.tool_choice).toBe("auto");
    expect(Array.isArray(request.tools)).toBe(true);
  });
});
