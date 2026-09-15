import { describe, expect, it } from "vitest";
import { classifyBlocker, retryDelayMs, shouldRetry } from "../../src/application/pm/blocker-policy.js";

describe("blocker policy", () => {
  it("classifies failure kinds", () => {
    expect(classifyBlocker("CAPABILITY_DENIED")).toBe("tool_failure");
    expect(classifyBlocker("DEPENDENCY_BLOCKED")).toBe("dependency");
    expect(classifyBlocker("QUESTION_REQUIRED")).toBe("decision_needed");
  });

  it("uses bounded exponential backoff and stops repeats", () => {
    expect(retryDelayMs(3, 100)).toBe(400);
    expect(retryDelayMs(20, 100)).toBe(60_000);
    expect(shouldRetry(2, 5, ["ERR", "ERR"], "ERR")).toBe(false);
    expect(shouldRetry(2, 5, ["OTHER"], "ERR")).toBe(true);
  });
});
