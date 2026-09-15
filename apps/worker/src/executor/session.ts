/**
 * @module executor/session
 * Execution session orchestrator mapping leased jobs to appropriate runtime engines (model coding agent, GitHub, Echo).
 */

import type { JobInput, JobExecutionContext } from "../worker-api/client.js";
import type { WorkerConfig } from "../config.js";
import { runModelAgent } from "./model-agent.js";
import { runEchoExecutor } from "./echo.js";
import { runGithubTool } from "./github.js";

/**
 * Standard structured result returned from job execution.
 */
export interface ExecutionResult {
  /** Outcome status */
  status: "succeeded" | "failed";
  /** Structured output payload */
  output: Record<string, unknown>;
  /** Optional error details if the job failed */
  error?: Record<string, unknown>;
}

/**
 * Dispatches and executes a leased job against the isolated sandbox environment.
 *
 * @param input - Validated job input parameters from Core.
 * @param sandboxPath - Local path to the isolated symlinked project workspace.
 * @param config - Worker node configuration.
 * @param execution - Optional context containing progress loggers and lifecycle abort checkers.
 * @returns Standardized ExecutionResult object.
 */
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
      output: { executor: "model" },
      error: {
        code: "EXECUTOR_NOT_ALLOWED",
        message: "Echo jobs are only allowed when the worker is explicitly started with KAMPAKU_EXECUTOR=echo",
      },
    };
  }

  return runModelAgent(input, sandboxPath, config, undefined, execution?.progress, execution?.control);
}
