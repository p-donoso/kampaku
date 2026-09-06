import { describe, expect, it } from "vitest";
import { planGoal } from "../src/planner/plan.js";

describe("planner fallback", () => {
  it("keeps an explicit execution request runnable when the LLM planner fails", async () => {
    const result = await planGoal({
      objective: "Resume MVP Sprint 2 and verify the Godot integration.",
      repositoryRole: "web",
      plannerMode: "llm",
      planner: { chat: async () => { throw new Error("provider unavailable"); } },
    });

    expect(result.plannerUsed).toBe("stub");
    expect(result.routedVia).toBe("planner-fallback");
    expect(result.task.prompt).toContain("Resume MVP Sprint 2");
    expect(result.task.repositoryRole).toBe("web");
  });
});
