import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runModelAgent } from "../src/executor/model-agent.js";

/**
 * **The completion gate reads the artifact, not the model's diligence.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r14`. The repair leaf fixed `src/ledger/parse.py` correctly: the fix in the
 * checkout is the one-line comment skip, and `PYTHONPATH=src python3 checks/test_parse.py` exits 0 when run by hand.
 * It had run its required check **once, before the edit** — the run that reproduced the defect — and never again, so
 * the job was failed `WORKER_CHECKS_INCOMPLETE` for a check that passes on the tree it left behind. The item went
 * blocked, its dependants were refused, and a correct repair could not close.
 *
 * A gate that depends on the model having re-run a command after its last edit is a gate on diligence. The executor
 * is the party that knows when the edits stopped, so it runs each unmet required check once, at the end, on the
 * finished tree — and only the unmet ones, so the cost is bounded.
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

describe("the executor verifies its required checks on the finished tree (suite 19 / s19r14)", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  /** The measured checkout: one runner, one member check that fails until the source is fixed. */
  async function legacyCheckout(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "kampaku-required-check-"));
    await writeFile(join(root, "src_parse.py"), "BROKEN = True\n");
    await writeFile(
      join(root, "check.py"),
      [
        "import pathlib, sys",
        "broken = 'BROKEN = True' in pathlib.Path('src_parse.py').read_text()",
        "print('ok' if not broken else 'FAILED')",
        "sys.exit(1 if broken else 0)",
        "",
      ].join("\n"),
    );
    await writeFile(join(root, "run-tests.sh"), '#!/bin/sh\npython3 check.py\n', { mode: 0o755 });
    return root;
  }

  it("passes the job whose required check goes green only after its own fix", async () => {
    directory = await legacyCheckout();
    const calls = vi
      .fn()
      // 1. Reproduce: the check fails on the broken tree (this is the run the model records).
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: {
          name: "run_check",
          arguments: JSON.stringify({ script: "check.py" }),
        } }] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
      // 2. Fix the source.
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: {
          name: "replace_in_file",
          arguments: JSON.stringify({ path: "src_parse.py", old_text: "BROKEN = True", new_text: "BROKEN = False" }),
        } }] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Fixed and verified." } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });

    const result = await runModelAgent(
      {
        prompt: "Fix src_parse.py so check.py passes",
        repositoryRole: "core",
        repositoryPath: directory,
        requiredChecks: ["check.py"],
      },
      directory,
      config,
      { chat: { completions: { create: calls } } } as never,
    );

    expect(result.status).toBe("succeeded");
    expect((result.output as { checkResults?: Record<string, boolean> }).checkResults?.["check.py"]).toBe(true);
    expect(await readFile(join(directory, "src_parse.py"), "utf8")).toContain("BROKEN = False");
  });

  it("still fails the job whose tree really is red: the gate is not softened", async () => {
    directory = await legacyCheckout();
    const calls = vi
      .fn()
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: {
          name: "write_file",
          arguments: JSON.stringify({ path: "notes.md", content: "nothing changed\n" }),
        } }] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Done." } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });

    const result = await runModelAgent(
      {
        prompt: "Record a note in notes.md",
        repositoryRole: "core",
        repositoryPath: directory,
        requiredChecks: ["check.py"],
      },
      directory,
      config,
      { chat: { completions: { create: calls } } } as never,
    );

    expect(result.status).toBe("failed");
    expect((result.error as { code?: string } | undefined)?.code).toBe("WORKER_CHECKS_INCOMPLETE");
  });
});
