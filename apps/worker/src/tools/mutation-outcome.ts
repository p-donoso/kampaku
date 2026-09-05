export const WORKER_INCOMPLETE_MUTATIONS_CODE = "WORKER_INCOMPLETE_MUTATIONS";
export const WORKER_NO_DELIVERABLES_CODE = "WORKER_NO_DELIVERABLES";

export function isMutationTool(name: string): boolean {
  return name === "write_file" || name === "replace_in_file";
}

export function parseToolMutationOk(content: string): boolean | undefined {
  try {
    const parsed = JSON.parse(content) as { ok?: unknown };
    if (typeof parsed.ok === "boolean") return parsed.ok;
  } catch {
    // Non-JSON tool output (list_files, read_file, etc.).
  }
  return undefined;
}

export function resolveRequiresDeliverables(input: { requiresDeliverables?: boolean }): boolean {
  return input.requiresDeliverables !== false;
}

export function shouldFailIncompleteMutations(failedMutations: number, successfulMutations: number): boolean {
  return failedMutations > 0 && successfulMutations === 0;
}

export function shouldFailMissingDeliverables(
  requiresDeliverables: boolean,
  successfulMutations: number,
): boolean {
  return requiresDeliverables && successfulMutations === 0;
}

export type WorkerCompletionFailure = {
  code: typeof WORKER_INCOMPLETE_MUTATIONS_CODE | typeof WORKER_NO_DELIVERABLES_CODE;
  message: string;
};

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
