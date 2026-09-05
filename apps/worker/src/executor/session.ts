import type { JobInput, JobExecutionContext } from "../worker-api/client.js";
import type { WorkerConfig } from "../config.js";
import { runFreeLlmAgent } from "../tools/freellm-agent.js";
import { runEchoExecutor } from "../tools/echo.js";
import { runGithubTool } from "../tools/github.js";

export interface ExecutionResult {
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  error?: Record<string, unknown>;
}

export async function executeJob(
  input: JobInput,
  sandboxPath: string,
  config: WorkerConfig,
  execution?: JobExecutionContext,
): Promise<ExecutionResult> {
  if (input.executor === "github") {
    execution?.progress.log("Running GitHub executor.");
    return runGithubTool(input, config);
  }

  if (config.executorMode === "echo") {
    execution?.progress.log("Running echo executor.");
    return runEchoExecutor(input, sandboxPath);
  }

  if (input.executor === "echo") {
    return {
      status: "failed",
      output: { executor: "freellmapi" },
      error: {
        code: "EXECUTOR_NOT_ALLOWED",
        message: "Echo jobs are only allowed when the worker is explicitly started with KAMPAKU_EXECUTOR=echo",
      },
    };
  }

  return runFreeLlmAgent(input, sandboxPath, config, undefined, execution?.progress, execution?.control);
}
