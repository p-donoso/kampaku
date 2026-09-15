import { describe, expect, it } from "vitest";
import { createProjectStatus } from "../../src/application/pm/project-status.js";

describe("honest project status", () => {
  it("requires evidence for implemented outcomes", () => {
    expect(() => createProjectStatus("implemented", "Done")).toThrow();
    expect(createProjectStatus("implemented", "Verified", ["audit.md"]).status).toBe("implemented");
  });
  it("supports uncertainty states with reasons", () => {
    expect(createProjectStatus("unverified", "Needs review").evidence).toEqual([]);
  });
});
