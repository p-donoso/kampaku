/**
 * @module tools/worker-verification
 * Verification engine inferring and executing required npm checks (e.g. test, build, typecheck).
 */

/** Error code indicating required checks were skipped or failed */
export const WORKER_CHECKS_INCOMPLETE_CODE = "WORKER_CHECKS_INCOMPLETE";

/** Marker separating acceptance criteria in task descriptions */
const ACCEPTANCE_CRITERIA_MARKER = "Acceptance criteria:";

/** Regex patterns for matching common npm check scripts from task descriptions */
const SCRIPT_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  { pattern: /\bnpm run test:e2e\b/i, script: "test:e2e" },
  { pattern: /\bnpm run build\b/i, script: "build" },
  { pattern: /\bnpm run typecheck\b/i, script: "typecheck" },
  { pattern: /\bnpm run test\b/i, script: "test" },
  { pattern: /\bnpm test\b/i, script: "test" },
  { pattern: /\bnpm run docs:build\b/i, script: "docs:build" },
];

/**
 * Extracts acceptance criteria section from a task prompt.
 */
function extractAcceptanceCriteriaSection(text: string): string {
  const idx = text.indexOf(ACCEPTANCE_CRITERIA_MARKER);
  if (idx < 0) return "";
  return text.slice(idx + ACCEPTANCE_CRITERIA_MARKER.length);
}

/**
 * Infers npm script names the worker must pass via `run_check` from task text or acceptance criteria.
 *
 * @param text - Full task prompt or acceptance criteria text.
 * @returns Array of required npm script names (e.g. `["test", "build"]`).
 */
export function inferRequiredCheckScripts(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, script } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) found.add(script);
  }
  return [...found];
}

/**
 * Resolves required check scripts: explicit job input wins; else scan acceptance criteria only.
 *
 * @param prompt - Full task prompt.
 * @param explicit - Explicitly supplied list of required check scripts.
 * @returns Array of required script names.
 */
export function resolveRequiredCheckScripts(
  prompt: string,
  explicit?: string[],
): string[] {
  if (explicit?.length) return explicit;
  return inferRequiredCheckScripts(extractAcceptanceCriteriaSection(prompt));
}

/**
 * Records the outcome of a `run_check` execution in the tracking map.
 *
 * @param results - Mutable map of script names to their success status.
 * @param toolOutput - String output from tool execution.
 * @param scriptHint - Optional fallback script name if not found in JSON.
 */
export function recordCheckResult(
  results: Map<string, boolean>,
  toolOutput: string,
  scriptHint?: string,
): void {
  try {
    const parsed = JSON.parse(toolOutput) as { ok?: unknown; script?: unknown };
    if (typeof parsed.script === "string") {
      results.set(parsed.script, parsed.ok === true);
      return;
    }
  } catch {
    // Legacy plain-text run_check output counts as success if the tool did not throw.
  }
  if (scriptHint) results.set(scriptHint, true);
}

/**
 * Evaluates whether all required check scripts were run and passed successfully.
 *
 * @param required - Array of required script names.
 * @param results - Map containing recorded execution results.
 * @returns Error descriptor if any check failed or was skipped, undefined if all passed.
 */
export function evaluateRequiredChecks(
  required: string[],
  results: Map<string, boolean>,
): { code: typeof WORKER_CHECKS_INCOMPLETE_CODE; message: string } | undefined {
  if (required.length === 0) return undefined;

  const missing = required.filter((script) => results.get(script) !== true);
  if (missing.length === 0) return undefined;

  const failed = required.filter((script) => results.has(script) && results.get(script) === false);
  if (failed.length > 0) {
    return {
      code: WORKER_CHECKS_INCOMPLETE_CODE,
      message: `Required checks failed: ${failed.join(", ")}. Fix errors and re-run run_check.`,
    };
  }

  return {
    code: WORKER_CHECKS_INCOMPLETE_CODE,
    message: `Required checks not run: ${missing.join(", ")}. Run run_check for each before finishing.`,
  };
}
