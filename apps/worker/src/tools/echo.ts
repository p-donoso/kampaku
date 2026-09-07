/**
 * @module tools/echo
 * Deterministic echo job executor used for local integration tests and smoke runs.
 */

import type { JobInput } from "../worker-api/client.js";

/**
 * Result returned by the echo executor.
 */
export interface EchoExecutorResult {
  status: "succeeded";
  output: Record<string, unknown>;
}

/**
 * Executes a simulated dry-run job, returning deterministic output without modifying files.
 *
 * @param input - Job input specification.
 * @param sandboxPath - Target sandbox path.
 * @returns Succeeded result summarizing prompt and target directory.
 */
export async function runEchoExecutor(
  input: JobInput,
  sandboxPath: string,
): Promise<EchoExecutorResult> {
  return {
    status: "succeeded",
    output: {
      summary: `[echo] Would run prompt in ${sandboxPath}: ${input.prompt}`,
      executor: "echo",
      repositoryRole: input.repositoryRole,
    },
  };
}
