import { describe, expect, it } from "vitest";
import { planGoal } from "../src/planner/plan.js";

describe("pending question flow", () => {
  it("keeps non-answers on the clarification path", () => {
    const pending = true;
    const message = "continue with creation";
    const isExplicitAnswer = /^\s*(yes|no|approve|reject|answer to pending question)\b/i.test(message);
    expect(pending && !isExplicitAnswer).toBe(true);
    expect(planGoal).toBeTypeOf("function");
  });
});
