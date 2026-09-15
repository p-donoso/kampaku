import { describe, expect, it } from "vitest";
import { requiresMinimumOperation, validateEnvironment } from "../../src/application/pm/environment-validation.js";

describe("environment validation", () => {
  it("reports incompatible assumptions before execution", () => {
    const report = validateEnvironment([{ id: "db", kind: "schema", description: "Schema uses unsupported feature", compatible: false }]);
    expect(report.compatible).toBe(false);
    expect(report.diagnostics[0]).toContain("schema");
    expect(requiresMinimumOperation(report.constraints)).toBe(true);
  });

  it("requires a passing minimum operation when stateful constraints exist", () => {
    const report = validateEnvironment([{ id: "service", kind: "service", description: "Service reachable", compatible: true }], { name: "create-and-read", passed: false });
    expect(report.compatible).toBe(false);
    expect(report.diagnostics).toContain("operation: create-and-read");
  });
});
