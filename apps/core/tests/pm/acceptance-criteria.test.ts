import { describe, expect, it } from "vitest";
import { identifyAcceptanceCriteria, formatAcceptanceCriteriaForWorker } from "../../src/application/pm/acceptance-criteria.js";

describe("acceptance criterion identity", () => {
  it("assigns stable IDs in work-item order", () => {
    expect(identifyAcceptanceCriteria(["first", "second"])).toEqual([{ id: "ac-1", text: "first" }, { id: "ac-2", text: "second" }]);
  });
  it("propagates IDs to worker instructions", () => {
    expect(formatAcceptanceCriteriaForWorker(["npm test passes"])[0]).toBe("[ac-1] npm test passes");
  });
});
