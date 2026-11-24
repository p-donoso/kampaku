import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runModelAgent } from "../src/executor/model-agent.js";
import type { JobInput } from "../src/worker-api/client.js";

/**
 * **A check's recorded output is a JSON document, and it has to stay one.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r31`. The `test` check of `legacy-ledger` failed with a two-traceback
 * report, and the evidence record held 601 characters:
 *
 *     {"ok":false,"script":"test","evidence":["run-tests.sh (executable check script)"],"command":"./run-tests.sh",
 *     "output":"checks/test_parse.py ... FAILED\nchecks/test_totals.py ... FAILED\n\nTraceback (
 *
 * — cut mid-string by a 600-character bound applied to the whole document. Nothing can read that: the command the
 * check resolved to is unreadable, its output is unreadable, and a criterion asking what the leaf's report quoted
 * about the run has nothing in the platform's own record to compare with. The leaf's report quoted the run verbatim
 * and the record could not answer for it, so the leaf went to the operator as a judgement question.
 *
 * What this locks: the document survives, the command survives, and the bound applies **inside** the output field,
 * where it says so.
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

describe("the output a check records (F-168)", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("records a failing runner's document intact, with its command and its output", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-check-output-"));
    // A check whose output is longer than the old 600-character bound, and which fails.
    await writeFile(
      join(directory, "checks.sh"),
      "#!/bin/sh\n"
        + "echo 'checks/test_parse.py ... FAILED'\n"
        + "echo 'checks/test_totals.py ... FAILED'\n"
        + "i=1\n"
        + "while [ $i -le 40 ]; do echo \"Traceback line $i: ValueError: not enough values to unpack\"; i=$((i+1)); done\n"
        + "exit 1\n",
      { mode: 0o755 },
    );
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "./checks.sh" } }));

    const input: JobInput = {
      prompt: "Run the repository's check and report what it printed.",
      repositoryPath: directory,
      requiredChecks: ["test"],
      evidenceOnly: true,
    };

    // The model runs the declared check and then reports; the second turn ends the job.
    const runCheck = {
      id: "call-check",
      type: "function" as const,
      function: { name: "run_check", arguments: JSON.stringify({ script: "test" }) },
    };
    const create = vi.fn();
    let iteration = 0;
    create.mockImplementation(async () => {
      iteration += 1;
      if (iteration === 1) {
        return {
          model: "auto",
          choices: [{ message: { role: "assistant", content: null, tool_calls: [runCheck] } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        };
      }
      return {
        model: "auto",
        choices: [{ message: { role: "assistant", content: "Ran the declared check; it fails on the parser." } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      };
    });

    const result = await runModelAgent(input, directory, config, { chat: { completions: { create } } } as never);
    const evidence = ((result.output as { evidence?: Array<Record<string, unknown>> }).evidence ?? []);
    const check = evidence.find((record) => record.subject === "test");
    expect(check, "the check it ran is recorded").toBeDefined();

    // The record is a document, not 600 characters of one.
    const recorded = String(check!.output);
    const parsed = JSON.parse(recorded) as { command?: string; ok?: boolean; output?: string };
    expect(parsed.command).toContain("checks.sh");
    expect(parsed.ok).toBe(false);
    expect(parsed.output).toContain("checks/test_parse.py ... FAILED");
    expect(parsed.output).toContain("Traceback line 30:");
    expect(parsed.output!.length).toBeLessThanOrEqual(8_100);
  }, 30_000);
});
