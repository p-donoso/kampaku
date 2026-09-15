import { describe, expect, it } from "vitest";
import { createScopeChange, validateScope } from "../../src/application/pm/scope-tracking.js";

describe("scope tracking", () => {
  it("requires reasons for deferred or rejected requirements", () => {
    expect(validateScope([{ id: "r1", description: "Requirement", status: "deferred" }]).ok).toBe(false);
    expect(validateScope([{ id: "r1", description: "Requirement", status: "deferred", reason: "Later phase" }]).ok).toBe(true);
  });

  it("records scope changes", () => {
    expect(createScopeChange("r1", "planned", "deferred", "Out of current scope").to).toBe("deferred");
  });
});
