import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { JobInput } from "../worker-api/client.js";
import type { WorkerConfig } from "../config.js";

const execFileAsync = promisify(execFile);

export async function runGithubTool(
  input: JobInput,
  config: WorkerConfig,
): Promise<{
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  error?: Record<string, unknown>;
}> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      status: "failed",
      output: {},
      error: { message: "GITHUB_TOKEN is required for github.api jobs" },
    };
  }

  const github = input.github;
  if (!github) {
    return {
      status: "failed",
      output: {},
      error: { message: "github payload is required for github executor jobs" },
    };
  }

  try {
    if (github.operation === "create_repo") {
      const args = [
        "repo",
        "create",
        `${github.owner}/${github.name}`,
        "--confirm",
        github.private ? "--private" : "--public",
      ];
      const { stdout } = await execFileAsync("gh", args, {
        env: { ...process.env, GH_TOKEN: token },
      });
      return {
        status: "succeeded",
        output: {
          executor: "github",
          operation: github.operation,
          repository: `${github.owner}/${github.name}`,
          stdout: stdout.trim(),
        },
      };
    }

    return {
      status: "failed",
      output: {},
      error: { message: `Unsupported github operation: ${github.operation}` },
    };
  } catch (error) {
    return {
      status: "failed",
      output: { executor: "github" },
      error: {
        message: error instanceof Error ? error.message : "GitHub tool failed",
      },
    };
  }
}
