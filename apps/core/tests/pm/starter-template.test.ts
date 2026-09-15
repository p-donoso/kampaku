import { describe, expect, it } from "vitest";
import { validateStarterTemplate } from "../../src/application/pm/starter-template.js";

describe("starter templates", () => {
  it("accepts a capability-based runnable template", () => {
    expect(validateStarterTemplate({ name: "base", capabilities: ["persistence"], requiredChecks: ["check"], hasDocumentation: true, examplesSeparated: true }).ok).toBe(true);
  });

  it("rejects undocumented or mixed example templates", () => {
    const result = validateStarterTemplate({ name: "base", capabilities: ["workflow"], requiredChecks: [], hasDocumentation: false, examplesSeparated: false });
    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(3);
  });
});
