/**
 * @module tools/mutation-outcome
 * Verification logic assessing whether code modifications or required deliverables were produced.
 */

/** Error code indicating all file mutation attempts failed */
export const WORKER_INCOMPLETE_MUTATIONS_CODE = "WORKER_INCOMPLETE_MUTATIONS";

/** Error code indicating no deliverables or file writes were performed */
export const WORKER_NO_DELIVERABLES_CODE = "WORKER_NO_DELIVERABLES";

/**
 * Checks if a tool name corresponds to a file mutation action.
 *
 * @param name - Tool name.
 * @returns True if the tool modifies the filesystem.
 */
export function isMutationTool(name: string): boolean {
  return name === "write_file" || name === "replace_in_file";
}

/**
 * Parses tool output JSON to determine if a mutation succeeded.
 *
 * @param content - Tool output string.
 * @returns Boolean if `ok` field is present, otherwise undefined.
 */
export function parseToolMutationOk(content: string): boolean | undefined {
  try {
    const parsed = JSON.parse(content) as { ok?: unknown };
    if (typeof parsed.ok === "boolean") return parsed.ok;
  } catch {
    // Non-JSON tool output (list_files, read_file, etc.).
  }
  return undefined;
}

/**
 * Resolves whether the job strictly requires deliverables (defaults to true).
 */
export function resolveRequiresDeliverables(input: { requiresDeliverables?: boolean }): boolean {
  return input.requiresDeliverables !== false;
}

/**
 * Determines whether a job failed because all attempted mutations failed without any success.
 */
export function shouldFailIncompleteMutations(failedMutations: number, successfulMutations: number): boolean {
  return failedMutations > 0 && successfulMutations === 0;
}

/**
 * Determines whether a job failed because file deliverables were required but none were written.
 */
export function shouldFailMissingDeliverables(
  requiresDeliverables: boolean,
  successfulMutations: number,
): boolean {
  return requiresDeliverables && successfulMutations === 0;
}

/**
 * Failure result indicating why worker completion criteria were not met.
 */
export type WorkerCompletionFailure = {
  code: typeof WORKER_INCOMPLETE_MUTATIONS_CODE | typeof WORKER_NO_DELIVERABLES_CODE;
  message: string;
};

/**
 * Evaluates whether the worker successfully completed required deliverable mutations.
 *
 * @param input - Mutation counts and requirement settings.
 * @returns `WorkerCompletionFailure` error descriptor or undefined if satisfied.
 */
export function evaluateWorkerCompletion(input: {
  requiresDeliverables?: boolean;
  failedMutations: number;
  successfulMutations: number;
}): WorkerCompletionFailure | undefined {
  if (shouldFailIncompleteMutations(input.failedMutations, input.successfulMutations)) {
    return {
      code: WORKER_INCOMPLETE_MUTATIONS_CODE,
      message: "All file write/replace attempts failed; the task was not completed in the repository.",
    };
  }

  if (shouldFailMissingDeliverables(resolveRequiresDeliverables(input), input.successfulMutations)) {
    return {
      code: WORKER_NO_DELIVERABLES_CODE,
      message: "The task finished without writing or updating any files in the repository.",
    };
  }

  return undefined;
}
