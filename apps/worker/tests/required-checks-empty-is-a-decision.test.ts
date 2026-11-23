import { describe, expect, it } from "vitest";
import { resolveRequiredCheckScripts } from "../src/tools/worker-verification.js";

/**
 * **An explicit "nothing must pass" is a decision, and the worker does not overrule it.**
 *
 * Measured 2026-11-23 on suite 19's run `s19r26`, on the plan's first repair leaf
 * (`Repair comment-line handling in src/ledger/parse.py (D1)`). Its `ac-3` reads, verbatim:
 *
 * > *The completion report quotes the post-fix `./run-tests.sh` output showing `checks/test_parse.py ... ok`, and
 * > states the runner's exit code (a remaining exit code of 1 attributable solely to the not-yet-repaired D2 check
 * > is acceptable and must be identified explicitly).*
 *
 * Core read that correctly and dispatched `requiredChecks: []` — the leaf asserts no green state, so nothing has to
 * pass for it. The worker then read the prompt, inferred `test` from the mention of `./run-tests.sh`, ran the
 * aggregate, saw the *sibling's* defect, and failed the job `WORKER_CHECKS_INCOMPLETE: Required checks failed: test`.
 * The parse fix was already on disk and `checks/test_parse.py ... ok`; the leaf died for a defect it does not own —
 * the same shape as BOARD F-149, one layer down, and the reason the prompt-inference fallback exists at all.
 *
 * The fallback is for the jobs that carry no policy: a `kampaku run`, a re-dispatch from an older Core. When Core
 * sends a list — including an empty one — that list **is** the policy, and the worker's own reading of the prose
 * does not get a second vote.
 */
const D1_PROMPT = [
  "# Repair comment-line handling in src/ledger/parse.py (D1)",
  "",
  "Run the checkout's declared check `./run-tests.sh` and `PYTHONPATH=src python3 checks/test_parse.py`, then fix the",
  "defect: a line whose first non-space character is `#` must contribute no row.",
  "",
  "## Acceptance criteria",
  "",
  "ac-1: The completion report quotes the post-fix `./run-tests.sh` output showing `checks/test_parse.py ... ok`.",
  "ac-2: `make check` exits 0 from the repository root.",
].join("\n");

describe("the worker's own check inference versus the policy Core sent (F-149, re-measured on s19r26)", () => {
  it("does not invent a check when Core sent an empty list", () => {
    expect(resolveRequiredCheckScripts(D1_PROMPT, [])).toEqual([]);
  });

  it("keeps the list Core sent, unchanged", () => {
    expect(resolveRequiredCheckScripts(D1_PROMPT, ["checks/test_parse.py"])).toEqual(["checks/test_parse.py"]);
  });

  it("still infers for a job that carries no policy at all", () => {
    // The control: `kampaku run` and older dispatches send no `requiredChecks` field, and those jobs must keep the
    // behaviour they had. The inference reads the prompt's acceptance-criteria section, so the control carries one.
    const noPolicy = [
      "Do the thing.",
      "",
      "Acceptance criteria:",
      "",
      "ac-1: `make check` exits 0 from the repository root.",
    ].join("\n");
    expect(resolveRequiredCheckScripts(noPolicy, undefined)).toEqual(["test"]);
    // And the same prompt with an explicit empty list asks for nothing: the policy wins over the prose.
    expect(resolveRequiredCheckScripts(noPolicy, [])).toEqual([]);
  });
});
