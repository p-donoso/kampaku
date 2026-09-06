import { describe, expect, it } from "vitest";
import { executeAssessChangeRequest } from "../src/agents/runtime/tools/change-control.js";

describe("change control", () => {
  it("requires approval for high-impact API changes", () => {
    const result = executeAssessChangeRequest({
      request: "Replace the public authentication API contract.",
      impact: "high",
      affects_scope: false,
      affects_security: true,
      affects_api: true,
    });
    expect(result.approvalRequired).toBe(true);
    expect(result.route).toMatch(/approval/);
  });

  it("allows low-impact owned refinement", () => {
    const result = executeAssessChangeRequest({
      request: "Clarify the existing task acceptance wording.",
      impact: "low",
      affects_scope: false,
      affects_security: false,
      affects_api: false,
    });
    expect(result.approvalRequired).toBe(false);
    expect(result.route).toMatch(/specialist/);
  });
});
