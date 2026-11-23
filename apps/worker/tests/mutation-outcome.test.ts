import { describe, expect, it } from "vitest";
import {
  evaluateWorkerCompletion,
  isMutationTool,
  parseToolMutationOk,
  shouldFailIncompleteMutations,
  shouldFailMissingDeliverables,
  WORKER_INCOMPLETE_MUTATIONS_CODE,
  WORKER_NO_DELIVERABLES_CODE,
} from "../src/tools/mutation-outcome.js";

describe("mutation-outcome", () => {
  it("detects failed mutation-only jobs", () => {
    expect(isMutationTool("write_file")).toBe(true);
    expect(parseToolMutationOk('{"ok":false,"error":"ENOENT"}')).toBe(false);
    expect(parseToolMutationOk('{"ok":true,"path":"ci.yml"}')).toBe(true);
    expect(parseToolMutationOk("file list output")).toBeUndefined();
    expect(shouldFailIncompleteMutations(3, 0)).toBe(true);
    expect(shouldFailIncompleteMutations(1, 1)).toBe(false);
    expect(shouldFailIncompleteMutations(0, 0)).toBe(false);
  });

  it("detects jobs that finish without repository deliverables", () => {
    expect(shouldFailMissingDeliverables(true, 0)).toBe(true);
    expect(shouldFailMissingDeliverables(true, 1)).toBe(false);
    expect(shouldFailMissingDeliverables(false, 0)).toBe(false);
    expect(evaluateWorkerCompletion({ requiresDeliverables: true, failedMutations: 0, successfulMutations: 0 })?.code).toBe(
      WORKER_NO_DELIVERABLES_CODE,
    );
    expect(evaluateWorkerCompletion({ requiresDeliverables: true, failedMutations: 2, successfulMutations: 0 })?.code).toBe(
      WORKER_INCOMPLETE_MUTATIONS_CODE,
    );
  });
});

/**
 * **A write the boundary refused is not a job that never wrote.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`, leaf `8559c90f`, eleven dispatches. Each job attempted both of its
 * deliverables, was refused by the write boundary with the path and the rule in the sentence, and was then reported
 * `WORKER_NO_DELIVERABLES — The task finished without writing or updating any files in the repository` with
 * `failedMutations: 0`. A refusal was counted as a correction rather than a failed write, which is right for the
 * model's loop and wrong for the record: the one message the operator reads said the leaf had not tried.
 *
 * F-155 asks the platform to answer three questions apart. This is the counting that separates them: a refusal is
 * an attempt (so the outcome is *incomplete mutations*, naming the rule), and no attempt at all is still a job that
 * finished without writing.
 */
describe("a refused write is an attempt, not silence (suite 19 / F-155)", () => {
  it("reports a policy-refused write as an incomplete mutation, naming the refusal", () => {
    const failure = evaluateWorkerCompletion({
      requiresDeliverables: true,
      failedMutations: 0,
      successfulMutations: 0,
      attemptedMutations: 2,
      policyRefusals: [
        "This job may not create packages/orders/src/summary.js: the work item's own acceptance criteria state that no new path may appear in this checkout.",
        "The plan freezes packages/orders/test/summary.test.js: it must not be modified by this job.",
      ],
    });
    expect(failure?.code).toBe(WORKER_INCOMPLETE_MUTATIONS_CODE);
    expect(failure?.message).toMatch(/packages\/orders\/src\/summary\.js/);
    expect(failure?.message).toMatch(/refused/i);
    // The sentence the operator reads may not claim the leaf did not try.
    expect(failure?.message).not.toMatch(/finished without writing/);
  });

  it("keeps a turn that never attempted a write on the deliverables rule", () => {
    expect(
      evaluateWorkerCompletion({
        requiresDeliverables: true,
        failedMutations: 0,
        successfulMutations: 0,
        attemptedMutations: 0,
        policyRefusals: [],
      })?.code,
    ).toBe(WORKER_NO_DELIVERABLES_CODE);
  });

  it("keeps a read-only job out of both rules", () => {
    expect(
      evaluateWorkerCompletion({
        requiresDeliverables: false,
        failedMutations: 0,
        successfulMutations: 0,
        attemptedMutations: 0,
        policyRefusals: [],
      }),
    ).toBeUndefined();
  });
});
