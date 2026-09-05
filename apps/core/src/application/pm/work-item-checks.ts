const SCRIPT_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  { pattern: /\bnpm run test:e2e\b/i, script: "test:e2e" },
  { pattern: /\bnpm run build\b/i, script: "build" },
  { pattern: /\bnpm run typecheck\b/i, script: "typecheck" },
  { pattern: /\bnpm run test\b/i, script: "test" },
  { pattern: /\bnpm test\b/i, script: "test" },
  { pattern: /\bnpm run docs:build\b/i, script: "docs:build" },
];

const ACCEPTANCE_CRITERIA_MARKER = "Acceptance criteria:";

/** Extract the acceptance-criteria section from a work-item objective or planner prompt. */
export function extractAcceptanceCriteriaSection(text: string): string {
  const idx = text.indexOf(ACCEPTANCE_CRITERIA_MARKER);
  if (idx < 0) return "";
  return text.slice(idx + ACCEPTANCE_CRITERIA_MARKER.length);
}

/** Infer npm script names that must pass from task text or acceptance criteria. */
export function inferRequiredCheckScripts(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, script } of SCRIPT_PATTERNS) {
    if (pattern.test(text)) found.add(script);
  }
  return [...found];
}

/** Infer checks from acceptance criteria only — not title, description, or planner boilerplate. */
export function inferRequiredChecksFromWorkItem(input: {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
}): string[] {
  if (input.acceptanceCriteria?.length) {
    return inferRequiredCheckScripts(input.acceptanceCriteria.join("\n"));
  }
  const fromObjective = extractAcceptanceCriteriaSection(
    [input.title, input.description ?? ""].filter(Boolean).join("\n\n"),
  );
  return inferRequiredCheckScripts(fromObjective);
}

export function inferRequiredChecksFromObjective(objective: string): string[] {
  return inferRequiredCheckScripts(extractAcceptanceCriteriaSection(objective));
}

export function evaluateJobCheckResults(
  required: string[],
  checkResults: Record<string, unknown> | undefined,
): { ok: true } | { ok: false; message: string } {
  if (required.length === 0) return { ok: true };

  const results = checkResults ?? {};
  const missing = required.filter((script) => results[script] !== true);
  if (missing.length === 0) return { ok: true };

  const failed = required.filter(
    (script) => script in results && results[script] !== true,
  );
  if (failed.length > 0) {
    return {
      ok: false,
      message: `Required checks failed: ${failed.join(", ")}.`,
    };
  }

  return {
    ok: false,
    message: `Required checks not run: ${missing.join(", ")}.`,
  };
}
