import { describe, expect, it } from "vitest";
import { decideIterationOutcome } from "../../src/application/pm/iteration-policy.js";

describe("iteration policy", () => {
  it("distinguishes progress, no progress, and blockers at the limit", () => {
    expect(decideIterationOutcome({ limit: 10, used: 10, successfulMutations: 2, checksPassed: false }).outcome).toBe("iteration_limited");
    expect(decideIterationOutcome({ limit: 10, used: 10, successfulMutations: 0, checksPassed: false }).nextLimit).toBe(10);
    expect(decideIterationOutcome({ limit: 10, used: 4, successfulMutations: 1, checksPassed: false, blocker: true }).outcome).toBe("blocked");
  });

  it("completes only after checks pass", () => {
    expect(decideIterationOutcome({ limit: 10, used: 1, successfulMutations: 0, checksPassed: true }).outcome).toBe("completed");
  });
});
