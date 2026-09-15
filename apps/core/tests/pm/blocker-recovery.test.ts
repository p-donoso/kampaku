import { describe, expect, it } from "vitest";
import { canRequeueWorkItem, escalationOwner, nextBlockerStatus, retryContext } from "../../src/application/pm/blocker-recovery.js";

describe("blocker recovery", () => {
  it("allows only valid pending transitions", () => {
    expect(nextBlockerStatus("pending", "resolve")).toBe("resolved");
    expect(() => nextBlockerStatus("resolved", "resolve")).toThrow();
  });

  it("requeues only after resolution and never duplicates an active job", () => {
    expect(canRequeueWorkItem("resolved", false)).toBe(true);
    expect(canRequeueWorkItem("resolved", true)).toBe(false);
    expect(retryContext(2, "TOOL_FAILURE", "Timeout").attempt).toBe(2);
    expect(escalationOwner("decision_dependency")).toBe("question-flow");
  });
});
