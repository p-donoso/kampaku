import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runModelAgent } from "../src/executor/model-agent.js";
import { WORKER_INCOMPLETE_MUTATIONS_CODE, WORKER_NO_DELIVERABLES_CODE } from "../src/tools/mutation-outcome.js";
import type { WorkerConfig } from "../src/config.js";
import type { JobInput } from "../src/worker-api/client.js";

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

describe("model-agent missing deliverables", () => {
  it("fails when the model stops after read-only exploration", async () => {
    const input: JobInput = {
      prompt: "Document the API in docs/api-reference.md",
      repositoryRole: "web",
      requiresDeliverables: true,
    };
    let call = 0;
    const create = async () => {
      call += 1;
      if (call === 1) {
        return {
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
                      name: "read_file",
                      arguments: JSON.stringify({ path: "package.json" }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        };
      }
      return {
        model: "free-model",
        choices: [{ message: { role: "assistant", content: "Documentation plan complete." } }],
        usage: { prompt_tokens: 20, completion_tokens: 7 },
      };
    };

    const result = await runModelAgent(input, "/tmp/kampaku-readonly-root", config, {
      chat: { completions: { create } },
    });

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe(WORKER_NO_DELIVERABLES_CODE);
  });
});

/**
 * **A refused write reaches the operator as a refusal, not as silence.**
 *
 * Leaf `8559c90f` attempted both of its deliverables on each of eleven dispatches (suite 19 run `s19r22`,
 * scenario M), was refused each time by the write boundary with the path and the rule in the sentence, and was
 * reported as *"The task finished without writing or updating any files in the repository"* — the one message that
 * says it never tried. A job that was told no and a job that never asked are different outcomes, and F-155 asks the
 * platform to keep them apart.
 */
describe("model-agent refused writes", () => {
  it("fails as an incomplete mutation and keeps the refusal's own words", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "kampaku-refused-write-"));
    try {
      const input: JobInput = {
        // The measured leaf's shape: a deliverable the plan also froze.
        prompt: "Create the new file src/a.js exporting the parser, and cover it with src/a.test.js.",
        repositoryRole: "core",
        requiresDeliverables: true,
        frozenPaths: ["src/a.js"],
      };
      let call = 0;
      const create = async () => {
        call += 1;
        if (call === 1) {
          return {
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
                        arguments: JSON.stringify({ path: "src/a.js", content: "export const a = 1;\n" }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          };
        }
        return {
          model: "free-model",
          choices: [{ message: { role: "assistant", content: "Blocked: the write was refused." } }],
          usage: { prompt_tokens: 20, completion_tokens: 7 },
        };
      };

      const result = await runModelAgent(input, sandbox, config, {
        chat: { completions: { create } },
      });

      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe(WORKER_INCOMPLETE_MUTATIONS_CODE);
      expect(String(result.error?.message)).toContain("src/a.js");
      expect(String(result.error?.message)).toMatch(/refused/i);
      expect(String(result.error?.message)).not.toMatch(/finished without writing/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
