import { describe, expect, it } from "vitest";
import { planWithStub } from "../../src/planner/stub.js";

describe("planWithStub", () => {
  it("returns a single task using the objective as prompt", () => {
    const task = planWithStub("Add health endpoint", "core");
    expect(task.prompt).toBe("Add health endpoint");
    expect(task.repositoryRole).toBe("core");
  });
});
