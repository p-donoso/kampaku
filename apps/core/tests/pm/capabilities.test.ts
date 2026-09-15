import { describe, expect, it } from "vitest";
import { assertCapabilityAllowed, buildDefaultCapabilityPolicy, isCapabilityAllowed, validateCapabilityPolicy } from "../../src/application/pm/capabilities.js";

describe("worker capability policy", () => {
  it("discovers generic verification capabilities", () => {
    const policy = buildDefaultCapabilityPolicy();
    expect(isCapabilityAllowed("inspect_media", policy)).toBe(true);
    expect(policy.timeoutMs).toBeGreaterThan(0);
  });

  it("denies capabilities outside the work-item policy", () => {
    const policy = { allowed: ["run_check"] as const, timeoutMs: 1000 };
    expect(() => assertCapabilityAllowed("inspect_ui", policy)).toThrow("Capability denied");
  });

  it("rejects unsafe timeout and duplicate policies", () => {
    expect(validateCapabilityPolicy({ allowed: ["run_check", "run_check"], timeoutMs: 0 }).ok).toBe(false);
    expect(validateCapabilityPolicy(buildDefaultCapabilityPolicy()).ok).toBe(true);
  });
});
