import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "../src/config.js";
import { runModelAgent } from "../src/executor/model-agent.js";
import type { JobInput } from "../src/worker-api/client.js";

/**
 * **A run that ended on its own detector still says what the agent said.**
 *
 * Measured 2026-11-23 on suite 19's run `s19r23`, work item `6975a2d6`: the worker's stall detector ended the job
 * after five iterations without a mutation — the agent had spent them reading the file and re-running its check —
 * and the completion report it recorded was one fixed sentence,
 *
 *     Agent stalled after writing deliverables.
 *
 * The job's own record carried `filesChanged: ["src/ledger/parse.py"]` and
 * `checkResults: {checks/test_parse.py: true}`, so the work was done and measured; what was lost was everything the
 * agent *wrote*. The closure gate then asked the operator five required questions — `ac-1` included, whose check
 * that same job had run and passed — and each was answered by re-deriving it from the checkout by hand.
 *
 * The rule these cases state: when the platform ends a run rather than the agent, the report says so **and** carries
 * the agent's own last words. A fixed sentence standing where the report was is a record that cannot be audited.
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

const FINAL_WORDS =
  "### What changed\n\n`src/ledger/parse.py` — comment lines are skipped before the splitter runs.\n\n" +
  "**Check evidence:** `checks/test_parse.py ... ok` (exit 0).";

function completion(content: string | null, toolCall?: { id: string; name: string; args: unknown }) {
  return {
    model: "auto",
    choices: [
      {
        message: {
          role: "assistant",
          content,
          tool_calls: toolCall
            ? [
                {
                  id: toolCall.id,
                  type: "function" as const,
                  function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) },
                },
              ]
            : undefined,
        },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  };
}

describe("a run the platform ended says so, and keeps the agent's words (F-158)", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("carries the agent's last message in the report of a stalled run", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-stalled-report-"));
    const input: JobInput = {
      prompt: "Fix the parse defect",
      repositoryRole: "web",
      repositoryPath: directory,
      requiresDeliverables: true,
    };

    // One mutation, then iterations that only read and re-run the check — the shape that tripped the detector.
    const create = vi
      .fn()
      .mockImplementationOnce(async () =>
        completion(null, {
          id: "call-write",
          name: "write_file",
          args: { path: "src/ledger/parse.py", content: "def parse_lines(text):\n    return []\n" },
        }),
      )
      .mockImplementation(async () =>
        completion(FINAL_WORDS, {
          id: "call-read",
          name: "read_file",
          args: { path: "src/ledger/parse.py" },
        }),
      );

    const result = await runModelAgent(
      input,
      directory,
      config,
      { chat: { completions: { create } } } as never,
    );

    const summary = String(result.output.summary ?? "");
    // It says plainly that the platform, not the agent, ended the run.
    expect(summary).toMatch(/stalled|stopped|ended/i);
    // And it keeps what the agent wrote, so the criteria that read "the report quotes …" can be met from the record.
    expect(summary).toContain("### What changed");
    expect(summary).toContain("checks/test_parse.py ... ok");
    // The fact that it stalled stays a record of its own; the report no longer replaces the work.
    expect(result.output.stalledAfterDeliverables).toBe(true);
    expect(result.output.filesChanged).toContain("src/ledger/parse.py");
    expect(await readFile(join(directory, "src/ledger/parse.py"), "utf8")).toContain("parse_lines");
  });

  it("says the agent sent no final message when it did not", async () => {
    directory = await mkdtemp(join(tmpdir(), "kampaku-stalled-silent-"));
    const input: JobInput = {
      prompt: "Fix the parse defect",
      repositoryRole: "web",
      repositoryPath: directory,
      requiresDeliverables: true,
    };

    const create = vi
      .fn()
      .mockImplementationOnce(async () =>
        completion(null, {
          id: "call-write",
          name: "write_file",
          args: { path: "src/ledger/parse.py", content: "def parse_lines(text):\n    return []\n" },
        }),
      )
      .mockImplementation(async () =>
        completion(null, { id: "call-read", name: "read_file", args: { path: "src/ledger/parse.py" } }),
      );

    const result = await runModelAgent(
      input,
      directory,
      config,
      { chat: { completions: { create } } } as never,
    );

    const summary = String(result.output.summary ?? "");
    expect(summary).toMatch(/no final message|nothing to report/i);
    // A report that carries no words still names what the record holds, so the operator knows where to look.
    expect(summary).toContain("src/ledger/parse.py");
  });
});
