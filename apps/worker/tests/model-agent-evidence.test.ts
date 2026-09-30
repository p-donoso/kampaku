import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runModelAgent } from "../src/executor/model-agent.js";
import type { JobInput } from "../src/worker-api/client.js";

/**
 * What a job's evidence and file list have to carry, locked where Core's closure gate reads them.
 *
 * Two defects measured on suite 08's run (2026-09-30) and fixed together, because either one alone leaves
 * hands-off execution unable to finish a step:
 *
 * - **F-077.** Three jobs reported `succeeded` with the raw output of the checks the work item's own
 *   acceptance criteria named, and Core refused all three with *"Evidence is failed, unverified, or
 *   unreferenced."* — the gate requires `passed`, `verified` and `reference` on every evidence record, and
 *   this producer sent neither `verified` nor `reference`. 189 248 tokens for one document, 0 of 8 leaves
 *   closed, and each refusal queued another job, so the failure mode was to spend more rather than to stop.
 * - **F-080.** The same jobs reported `filesChanged: null` while their summaries named the file they wrote,
 *   so the journal's post-action carried `"files": []` and the front office told the operator that nothing
 *   had landed on a checkout that had a new artifact in it.
 *
 * This asserts the three things a job now has to produce, from the executor's own output: the files it
 * actually changed, and a verified observation with a reference for every check and every artifact.
 *
 * The check references are the **resolved commands**, not the check names, because that is what makes a
 * reference usable: an operator can paste `make check` into a shell, and `lint` alone would send them looking.
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

describe("model-agent evidence and file list", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("reports the files it wrote, and a verified reference for every observation it returns", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-evidence-"));
    // The suite-07 fixture shape: a repository whose own checks are `make check` and `make lint`.
    await writeFile(
      join(directory, "Makefile"),
      ".PHONY: check lint\n\ncheck:\n\t@true\n\nlint:\n\t@true\n",
    );
    const input: JobInput = {
      prompt: "Write the CLI contract document.",
      repositoryRole: "core",
      repositoryPath: directory,
      requiredChecks: ["test", "lint"],
    };
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "write_file",
                    arguments: JSON.stringify({
                      path: "docs/cli.md",
                      content:
                        "# CLI contract\n\nThe invocation is `python3 -m textstats [--top N] [FILE]`, run from the repository root.\n",
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Wrote the contract." } }],
        usage: { prompt_tokens: 20, output_tokens: 7 },
      });

    const result = await runModelAgent(input, directory, config, {
      chat: { completions: { create } },
    });

    expect(result.status).toBe("succeeded");
    const output = result.output as {
      filesChanged?: string[];
      evidence?: Array<Record<string, unknown>>;
    };

    expect(output.filesChanged, "the job names the files it changed").toEqual(["docs/cli.md"]);

    const evidence = output.evidence ?? [];
    expect(evidence.length, "observations were made").toBeGreaterThan(0);
    for (const record of evidence) {
      expect(record.verified, `${String(record.subject)} carries the verified state the gate requires`).toBe(true);
      expect(typeof record.reference, `${String(record.subject)} carries a reference`).toBe("string");
      expect(String(record.reference).length).toBeGreaterThan(0);
    }

    const artifact = evidence.find((record) => record.criterionId === "artifact:docs/cli.md");
    expect(artifact, "the file it wrote was inspected, not just written").toBeDefined();
    expect(artifact?.reference).toBe("docs/cli.md");

    const checkReferences = evidence
      .filter((record) => record.sourceTool === "run_check")
      .map((record) => record.reference)
      .sort();
    expect(checkReferences, "a reference is the command that ran, not the check's short name").toEqual([
      "make check",
      "make lint",
    ]);
  });
});
