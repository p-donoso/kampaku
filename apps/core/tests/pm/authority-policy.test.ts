import { describe, expect, it } from "vitest";
import { assertIndependentApproval, createOverride, mayPerform } from "../../src/application/pm/authority-policy.js";

describe("authority policy", () => {
  it("separates planning, implementation, and audit authority", () => {
    expect(mayPerform("planner", "approve")).toBe(false);
    expect(mayPerform("auditor", "reopen")).toBe(true);
    expect(() => assertIndependentApproval("implementer", "implementer")).toThrow("independent");
  });

  it("records evidence-backed overrides", () => {
    const override = createOverride("auditor", "override", "Verified emergency exception", ["audit.md"]);
    expect(override.evidence).toEqual(["audit.md"]);
  });
});
