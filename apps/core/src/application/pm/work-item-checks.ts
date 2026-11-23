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
  //
  // The last two arms are the brownfield shape measured 2026-11-05 on suite 19: a legacy repository whose only
  // check is the script it declares, `./run-tests.sh`, invoked from the root or from `scripts/`. The vocabulary
  // has to know a check runner by the shape of its name here, because this function is context-free by design —
  // the declarations are read from the checkout, and the two vocabularies have to agree on what they name.
  { pattern: /\bnpm run test\b(?!:)|\bnpm test\b|\bpytest\b|\bpython3? -m pytest\b|\bpython3? -m unittest\b|\bunittest discover\b|\bcargo test\b|\bgo test\b|\bmix test\b|\bmvn (verify|test)\b|\bgradle\w* test\b|\bdotnet test\b|\bdart test\b|\bbundle exec (rspec|rake test)\b|\bmake (test|check)\b|\bjust (test|check)\b|\bzig build test\b|\bctest\b|\bnpx (jest|vitest)\b|(?:^|[\s`"'(])(?:\.\/)?[\w./-]*(?:run[-_]?tests?|checks?|verify)\.(?:sh|bash)\b/i, script: "test" },
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
 * A criterion that asserts a check came out **well**, not merely that its result was observed.
 *
 * This distinction is the difference between a factory that can work on a broken repository and one that cannot.
 * Measured 2026-11-05 on suite 19's third run (`s19r3`), on a legacy checkout whose own `./run-tests.sh` fails:
 * the plan's first leaf was *"capture the baseline: run `./run-tests.sh`, its exit code and its full output"*, the
 * job ran it, recorded exit 1 with the verbatim output, and the leaf was then refused because the required check
 * was not green — so the item that **observes** the failure can never close, and every later leaf is refused with
 * *"Dependency tasks must be completed first"*. A brownfield repair begins by observing a failure; a gate that
 * demands green to accept the observation is a closed loop.
 *
 * So: a criterion that says *exits 0*, *passes*, *is green*, *succeeds* requires the check to pass. A criterion
 * that quotes the check to record what it printed requires the check to **run**, which is a capability
 * (`run_check` is open for any checkout that declares a check) and is judged on its evidence.
 */
const SUCCESS_ASSERTION =
  /(?:^|[\s`"'(])(?:exits?\s+(?:with\s+)?(?:(?:code|status)\s+)?0|exit\s+(?:code|status)\s*:?\s*0|(?:exit\s+)?status\s*:?\s*(?:is\s+)?0|reported\s+ok|ok\s+line|passes|passing|is\s+green|goes\s+green|succeeds|succeeded|returns?\s+0|ok:\s*true|is\s+clean)(?=$|[\s`"'.,;:)])/i;

/** Whether a criterion requires its check to come out green, rather than to have been run and recorded. */
export function assertsCheckSuccess(text: string): boolean {
  return SUCCESS_ASSERTION.test(text);
}

/**
 * The check names a criterion requires to **pass**.
 *
 * `inferRequiredCheckScripts` answers "which check does this text name"; this answers "which check does this
 * text require to be green", which is the question the dispatch and the closure gate need.
 */
export function inferPassingCheckScripts(text: string): string[] {
  if (!assertsCheckSuccess(text)) return [];
  return inferRequiredCheckScripts(text);
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
    // Only the criteria that assert a good result require a green check; one that asks for the check's output is
    // an observation, and the leaf it belongs to must be able to close on a repository that is still broken.
    const asserted = input.acceptanceCriteria.filter((criterion) => assertsCheckSuccess(criterion));
    if (asserted.length === 0) return [];
    return inferRequiredCheckScripts(asserted.join("\n"));
  }
  const fromObjective = extractAcceptanceCriteriaSection(
    [input.title, input.description ?? ""].filter(Boolean).join("\n\n"),
  );
  return inferPassingCheckScripts(fromObjective);
}

export function inferRequiredChecksFromObjective(objective: string): string[] {
  return inferPassingCheckScripts(extractAcceptanceCriteriaSection(objective));
}

export function evaluateJobCheckResults(
  required: string[],
  checkResults: Record<string, unknown> | undefined,
  /**
   * What the check read **before** this job ran (`baseline-checks.ts`).
   *
   * A required check that was already red and is still red is not a regression, and a leaf behind another defect
   * cannot be held to a green aggregate nobody said was green. Green then red is a regression and is refused; red then
   * red is the state this job was sent into. Absent, the check is required to be green, which is the reading the
   * dispatch has always applied when nobody recorded a before.
   */
  baselineResults?: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  if (required.length === 0) return { ok: true };

  const results = checkResults ?? {};
  const missing = required.filter((script) => results[script] !== true);
  if (missing.length === 0) return { ok: true };

  const failed = required.filter(
    (script) =>
      script in results &&
      results[script] !== true &&
      baselineResults?.[script] !== false,
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
