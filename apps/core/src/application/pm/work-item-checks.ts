/**
 * Check names a criterion can require, and the commands from any toolchain that require them.
 *
 * These were npm-only, and that was a real defect on this side of the wire even after the worker's copy
 * was fixed: the worker recognised `pytest`, `cargo test`, `make check` and the rest while Core still
 * matched only `npm …`, so for a non-Node repository **Core required no checks at all** — a silently
 * empty gate, which is the same defect class as the one the worker's copy carried (BOARD F-003) and the
 * reason suite 08's Makefile-wrapped Python fixture was measured with four criteria Core could not
 * classify (BOARD F-082). Core decides closure and routing from the same criterion text the worker runs
 * checks from, so the two vocabularies have to be one vocabulary.
 *
 * Order is deliberate: the first pattern that matches wins, so `npm run test:e2e` is an e2e check rather
 * than a test check, and `make check` is a test check rather than a build.
 */
const SCRIPT_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  // End-to-end first: it is the most specific, and it must not collapse into `test`.
  { pattern: /\bnpm run test:e2e\b|\bplaywright test\b|\bcypress run\b|\be2e\b/i, script: "test:e2e" },
  // Builds and packaging.
  { pattern: /\bnpm run build\b|\bcargo build\b|\bgo build\b|\bmvn .*package\b|\bgradle\w* build\b|\bdotnet build\b|\bmix compile\b|\bzig build\b|\bmake (build|all)\b|\bjust build\b/i, script: "build" },
  // Type checking.
  { pattern: /\bnpm run typecheck\b|\btsc\b|\bmypy\b|\bcargo check\b|\bpyright\b|\bmake typecheck\b/i, script: "typecheck" },
  // Linters.
  { pattern: /\bnpm run lint\b|\beslint\b|\bruff check\b|\bcargo clippy\b|\bgo vet\b|\bgolangci-lint\b|\bcomposer run lint\b|\bmake lint\b/i, script: "lint" },
  // Tests last: the test pattern also matches the prefix of `npm run test:e2e`, which the first entry has
  // already claimed, and the lookahead keeps an e2e run from requiring `test` as well.
  { pattern: /\bnpm run test\b(?!:)|\bnpm test\b|\bpytest\b|\bpython3? -m pytest\b|\bpython3? -m unittest\b|\bunittest discover\b|\bcargo test\b|\bgo test\b|\bmix test\b|\bmvn (verify|test)\b|\bgradle\w* test\b|\bdotnet test\b|\bdart test\b|\bbundle exec (rspec|rake test)\b|\bmake (test|check)\b|\bjust (test|check)\b|\bzig build test\b|\bctest\b|\bnpx (jest|vitest)\b/i, script: "test" },
  // Documentation builds stay explicitly named: the platform does not guess a docs toolchain.
  { pattern: /\bnpm run docs:build\b/i, script: "docs:build" },
];

const ACCEPTANCE_CRITERIA_MARKER = "Acceptance criteria:";

/** Extract the acceptance-criteria section from a work-item objective or planner prompt. */
export function extractAcceptanceCriteriaSection(text: string): string {
  const idx = text.indexOf(ACCEPTANCE_CRITERIA_MARKER);
  if (idx < 0) return "";
  return text.slice(idx + ACCEPTANCE_CRITERIA_MARKER.length);
}

/**
 * Infer the check names a task text or acceptance criteria require.
 *
 * The names are toolchain-neutral (`test`, `lint`, `build`, `typecheck`, `test:e2e`, `docs:build`); the
 * repository declares which executable each one maps to, and the worker resolves it there. A criterion
 * naming `make check` therefore requires `test` exactly as `npm test` does — see SCRIPT_PATTERNS.
 */
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
