/**
 * @module tools/worker-verification
 * Verification engine: which checks a task requires, and whether they ran and passed.
 *
 * Check *names* are toolchain-neutral (`test`, `build`, `lint`, `typecheck`, `e2e`); the command
 * behind a name is resolved against the repository by `project-toolchain.ts`. Inference used to
 * recognise only `npm` mentions, so a criterion naming `pytest` or `cargo test` produced no required
 * check at all — a silently empty gate for every non-Node project ([BOARD F-003](../../../../docs/eval/results/BOARD.md)).
 */

/** Error code indicating required checks were skipped or failed */
export const WORKER_CHECKS_INCOMPLETE_CODE = "WORKER_CHECKS_INCOMPLETE";

/** Marker separating acceptance criteria in task descriptions */
const ACCEPTANCE_CRITERIA_MARKER = "Acceptance criteria:";

/**
 * Check names a criterion can require, and the commands from any toolchain that require them.
 *
 * Order is deliberate: the first pattern that matches a criterion wins, so `npm run test:e2e` is
 * classified as an e2e check rather than as a test check.
 */
const CHECK_PATTERNS: Array<{ pattern: RegExp; script: string }> = [
  // End-to-end first: it is the most specific, and it must not collapse into `test`.
  { pattern: /\bnpm run test:e2e\b|\bplaywright test\b|\bcypress run\b|\be2e\b/i, script: "test:e2e" },
  // Builds and packaging.
  { pattern: /\bnpm run build\b|\bcargo build\b|\bgo build\b|\bmvn .*package\b|\bgradle\w* build\b|\bdotnet build\b|\bmix compile\b|\bzig build\b|\bmake (build|all)\b|\bjust build\b/i, script: "build" },
  // Type checking.
  { pattern: /\bnpm run typecheck\b|\btsc\b|\bmypy\b|\bcargo check\b|\bpyright\b|\bmake typecheck\b/i, script: "typecheck" },
  // Linters.
  { pattern: /\bnpm run lint\b|\beslint\b|\bruff check\b|\bcargo clippy\b|\bgo vet\b|\bgolangci-lint\b|\bcomposer run lint\b|\bmake lint\b/i, script: "lint" },
  // Tests last: `npm run test` also matches the prefix of `npm run test:e2e`, and the pattern above
  // has already claimed that case.
  // The trailing lookahead keeps `npm run test:e2e` from also requiring `test`.
  //
  // The last arm is a check runner the repository declares as a script (`./run-tests.sh`, `scripts/check.sh`),
  // which is the only check a legacy checkout may have — measured 2026-11-05 on suite 19, where the repo's own
  // `CONTRIBUTING.md` names `./run-tests.sh` as the one supported command and this vocabulary knew no such shape,
  // so the job required no check and the executor refused to run the one that proves anything.
  { pattern: /\bnpm run test\b(?!:)|\bnpm test\b|\bpytest\b|\bpython -m pytest\b|\bcargo test\b|\bgo test\b|\bmix test\b|\bmvn (verify|test)\b|\bgradle\w* test\b|\bdotnet test\b|\bdart test\b|\bbundle exec (rspec|rake test)\b|\bmake (test|check)\b|\bjust (test|check)\b|\bzig build test\b|\bctest\b|\bnpx (jest|vitest)\b|(?:^|[\s`"'(])(?:\.\/)?[\w./-]*(?:run[-_]?tests?|checks?|verify)\.(?:sh|bash)\b/i, script: "test" },
  // Documentation builds stay explicitly named: the platform does not guess a docs toolchain.
  { pattern: /\bnpm run docs:build\b/i, script: "docs:build" },
];

/** @deprecated Name retained for callers; the patterns are no longer npm-only. */
const SCRIPT_PATTERNS = CHECK_PATTERNS;

/**
 * Extracts acceptance criteria section from a task prompt.
 */
function extractAcceptanceCriteriaSection(text: string): string {
  const idx = text.indexOf(ACCEPTANCE_CRITERIA_MARKER);
  if (idx < 0) return "";
  return text.slice(idx + ACCEPTANCE_CRITERIA_MARKER.length);
}

/**
 * Infers the check names a task requires, from task text or acceptance criteria.
 *
 * The names are toolchain-neutral; the repository decides which executable each one maps to. A
 * criterion naming `pytest`, `cargo test`, `go test ./...`, or `make check` therefore produces the
 * same `test` requirement as `npm test`, instead of none.
 *
 * @param text - Full task prompt or acceptance criteria text.
 * @returns Array of required check names (e.g. `["test", "build"]`).
 */
export function inferRequiredCheckScripts(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, script } of CHECK_PATTERNS) {
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
/**
 * The other direction: a check this job was sent to find **red**.
 *
 * Measured 2026-11-11 on suite 19 run `s19r18`, job `2e2e43ab` (*LL-1.2 Reproduce the declared check
 * `./run-tests.sh`*, whose criteria ask for the verbatim output and `expected exit=1 at baseline`). Core read the
 * leaf as a proof and dispatched no green check — and the worker, holding only the string `test` inferred from the
 * prompt's criteria, ran it, found it red (which is the deliverable) and failed the job
 * `WORKER_CHECKS_INCOMPLETE: Required checks failed: test`.
 *
 * A baseline leaf that *passes* measured nothing, so the rule inverts: every required check must have run, and must
 * be false. Anything else is the failure.
 */
export function evaluateExpectFailingCheck(
  required: string[],
  results: Map<string, boolean>,
): { code: typeof WORKER_CHECKS_INCOMPLETE_CODE; message: string } | undefined {
  if (required.length === 0) return undefined;

  const notRun = required.filter((script) => !results.has(script));
  if (notRun.length > 0) {
    return {
      code: WORKER_CHECKS_INCOMPLETE_CODE,
      message: `Required checks not run: ${notRun.join(", ")}. Run run_check for each before finishing.`,
    };
  }

  const passing = required.filter((script) => results.get(script) === true);
  if (passing.length > 0) {
    return {
      code: WORKER_CHECKS_INCOMPLETE_CODE,
      message:
        `Required check(s) expected to fail but passed: ${passing.join(", ")}. This leaf exists to record the ` +
        "state the checkout is in before a repair, so a check that passes proves nothing here: re-record the check's " +
        "verbatim output and its exit code, and do not change any file to make it pass.",
    };
  }

  return undefined;
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
