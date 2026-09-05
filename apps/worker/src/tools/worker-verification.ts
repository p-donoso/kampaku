export const WORKER_CHECKS_INCOMPLETE_CODE = "WORKER_CHECKS_INCOMPLETE";

const ACCEPTANCE_CRITERIA_MARKER = "Acceptance criteria:";

const SCRIPT_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  { pattern: /\bnpm run test:e2e\b/i, script: "test:e2e" },
  { pattern: /\bnpm run build\b/i, script: "build" },
  { pattern: /\bnpm run typecheck\b/i, script: "typecheck" },
  { pattern: /\bnpm run test\b/i, script: "test" },
  { pattern: /\bnpm test\b/i, script: "test" },
  { pattern: /\bnpm run docs:build\b/i, script: "docs:build" },
];

function extractAcceptanceCriteriaSection(text: string): string {
  const idx = text.indexOf(ACCEPTANCE_CRITERIA_MARKER);
  if (idx < 0) return "";
  return text.slice(idx + ACCEPTANCE_CRITERIA_MARKER.length);
}

/** Infer npm script names the worker must pass via run_check from task text / AC. */
export function inferRequiredCheckScripts(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, script } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) found.add(script);
  }
  return [...found];
}

/** Resolve required checks: explicit job input wins; else scan acceptance criteria only. */
export function resolveRequiredCheckScripts(
  prompt: string,
  explicit?: string[],
): string[] {
  if (explicit?.length) return explicit;
  return inferRequiredCheckScripts(extractAcceptanceCriteriaSection(prompt));
}

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
