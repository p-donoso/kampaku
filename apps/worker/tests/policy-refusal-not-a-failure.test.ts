import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runModelAgent } from "../src/executor/model-agent.js";
import { isPolicyRefusal, policyRefusal } from "../src/tools/file-tools.js";

/**
 * **A refusal is a correction, not a failed write.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r12`. The plan's baseline leaf carried an acceptance criterion that asked
 * for a capture under `/tmp` — outside the granted folders — so its first write was refused by the boundary. The
 * job then did its real work (ran `./run-tests.sh`, recorded the output) and was still failed
 * `WORKER_INCOMPLETE_MUTATIONS`, because the executor counted that one refusal as a failed mutation and a job with
 * zero successful mutations and one failure is, by the rule, incomplete. The item went blocked, its dependants were
 * refused, and the whole repair chain stopped on a path the plan should never have written in the first place.
 *
 * The distinction the code now keeps: a write that failed is a problem with the write; a write the product's own
 * rules refused is the boundary doing its job, and the model is expected to carry on without it.
 */
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

describe("a policy refusal does not fail the job (suite 19 / s19r12)", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("marks refusals as policy refusals, and a plain write error as nothing of the sort", () => {
    expect(isPolicyRefusal(policyRefusal("no"))).toBe(true);
    expect(isPolicyRefusal(new Error("disk full"))).toBe(false);
    expect(isPolicyRefusal(undefined)).toBe(false);
  });

  it("succeeds when its only failed write is a boundary refusal and its work landed", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-policy-refusal-"));
    const calls = vi
      .fn()
      // 1. The forbidden capture: an absolute path outside the checkout.
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: {
          name: "write_file",
          arguments: JSON.stringify({ path: "/tmp/legacy-ledger-baseline/run-tests.txt", content: "baseline\n" }),
        } }] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
      // 2. The write the leaf is actually for.
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: {
          name: "write_file",
          arguments: JSON.stringify({ path: "notes.md", content: "# baseline\n" }),
        } }] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Recorded the baseline." } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });

    const result = await runModelAgent(
      { prompt: "Record the baseline in notes.md", repositoryRole: "core", repositoryPath: directory },
      directory,
      config,
      { chat: { completions: { create: calls } } } as never,
    );

    expect(result.status).toBe("succeeded");
    expect(await readFile(join(directory, "notes.md"), "utf8")).toBe("# baseline\n");
  });
});
