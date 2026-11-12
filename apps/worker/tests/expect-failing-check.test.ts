import { describe, expect, it } from "vitest";
import { evaluateExpectFailingCheck } from "../src/tools/worker-verification.js";

/**
 * **A leaf that was sent to record a red check is not failed for recording it.**
 *
 * Measured 2026-11-11 on suite 19 run `s19r18`, job `2e2e43ab` (*LL-1.2 Reproduce the declared check
 * `./run-tests.sh`*). Its criteria ask for the runner's verbatim output, its numeric exit code and
 * `expected exit=1 at baseline` — the leaf exists to pin the broken state before anything is repaired. Core reasoned
 * that through and sent no required check (`dispatchRequiredChecks` reads a criterion that asserts no success and
 * concludes nothing must be green). The **worker** then inferred `test` from the prompt's own acceptance-criteria
 * text, ran it, found it red — which is what the task asked for — and failed the job
 * `WORKER_CHECKS_INCOMPLETE: Required checks failed: test`, with a journal written and the evidence intact.
 *
 * Two readers of one sentence disagreed, and the one that failed the job knew less: Core can see the work item's
 * `expectsFailingCheck`, the worker only had the string `test`. So the expectation travels with the job, and the
 * worker checks the other direction: the check must have **run** and must be **red**. A check that passes is the
 * failure here, because a baseline leaf that "passes" measured nothing.
 */
describe("a job sent to record a failing check (suite 19 / s19r18)", () => {
  it("accepts a check that ran and failed, which is what it was sent to record", () => {
    expect(evaluateExpectFailingCheck(["test"], new Map([["test", false]]))).toBeUndefined();
  });

  it("refuses a check that passed, because a baseline that passes recorded nothing", () => {
    const failure = evaluateExpectFailingCheck(["test"], new Map([["test", true]]));
    expect(failure?.code).toBe("WORKER_CHECKS_INCOMPLETE");
    expect(failure?.message).toContain("test");
    expect(failure?.message, "the sentence says which direction is missing").toMatch(/expected to fail/i);
  });

  it("refuses a check that was never run", () => {
    const failure = evaluateExpectFailingCheck(["test"], new Map());
    expect(failure?.message).toMatch(/not run/i);
  });

  it("says nothing when no check is required", () => {
    expect(evaluateExpectFailingCheck([], new Map())).toBeUndefined();
  });
});
